import fs from 'node:fs';
import path from 'node:path';
import type { CompileLimits } from '@texly/shared';
import type { JobWorkDir } from '../workdir/workdir-manager.js';

export class OutputCollectionError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'OUTPUT_COLLECTION_FAILED',
  ) {
    super(message);
    this.name = 'OutputCollectionError';
  }
}

export interface CollectedOutputs {
  pdfPath?: string | undefined;
  pdfSizeBytes?: number | undefined;
  synctexPath?: string | undefined;
  synctexSizeBytes?: number | undefined;
  logPath: string;
  logSizeBytes: number;
  rawLogContent: string;
  totalOutputFileCount: number;
}

export async function collectSafeOutputs(
  workDirs: JobWorkDir,
  mainFile: string,
  limits: CompileLimits,
): Promise<CollectedOutputs> {
  const mainBasename = path.basename(mainFile, path.extname(mainFile));
  const maxPdfBytes = limits.maxPdfMb * 1024 * 1024;
  const maxLogBytes = limits.maxLogMb * 1024 * 1024;
  const maxOutputFiles = limits.maxOutputFiles;

  let totalOutputFileCount = 0;

  // Function to safely scan directory with lstat
  async function scanDirectory(
    dirPath: string,
  ): Promise<Map<string, { fullPath: string; size: number }>> {
    const fileMap = new Map<string, { fullPath: string; size: number }>();
    if (!fs.existsSync(dirPath)) {
      return fileMap;
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const stat = await fs.promises.lstat(entryPath);

      // Strictly reject symlinks, FIFOs, sockets, block/char devices
      if (stat.isSymbolicLink()) {
        continue;
      }

      if (stat.isDirectory()) {
        const subFiles = await scanDirectory(entryPath);
        for (const [k, v] of subFiles.entries()) {
          fileMap.set(k, v);
        }
        continue;
      }

      if (stat.isFile()) {
        totalOutputFileCount++;
        if (totalOutputFileCount > maxOutputFiles) {
          throw new OutputCollectionError(
            `Total output files (${totalOutputFileCount}) exceeded maximum allowed limit (${maxOutputFiles})`,
            'MAX_OUTPUT_FILES_EXCEEDED',
          );
        }
        fileMap.set(entry.name, { fullPath: entryPath, size: stat.size });
      }
    }

    return fileMap;
  }

  const outFiles = await scanDirectory(workDirs.outDir);
  const auxFiles = await scanDirectory(workDirs.auxDir);

  // 1. Locate PDF (check /work/out/<mainBasename>.pdf)
  const expectedPdfName = `${mainBasename}.pdf`;
  const pdfEntry = outFiles.get(expectedPdfName);
  let pdfPath: string | undefined;
  let pdfSizeBytes: number | undefined;

  if (pdfEntry) {
    if (pdfEntry.size > maxPdfBytes) {
      throw new OutputCollectionError(
        `PDF file size (${pdfEntry.size} bytes) exceeds limit of ${maxPdfBytes} bytes`,
        'OUTPUT_TOO_LARGE',
      );
    }
    pdfPath = pdfEntry.fullPath;
    pdfSizeBytes = pdfEntry.size;
  }

  // 2. Locate SyncTeX (check /work/out/<mainBasename>.synctex.gz or .synctex)
  const expectedSyncTexName = `${mainBasename}.synctex.gz`;
  const synctexEntry = outFiles.get(expectedSyncTexName) || auxFiles.get(expectedSyncTexName);
  let synctexPath: string | undefined;
  let synctexSizeBytes: number | undefined;

  if (synctexEntry) {
    synctexPath = synctexEntry.fullPath;
    synctexSizeBytes = synctexEntry.size;
  }

  // 3. Locate Log (check /work/out/<mainBasename>.log or /work/aux/<mainBasename>.log)
  const expectedLogName = `${mainBasename}.log`;
  const logEntry = outFiles.get(expectedLogName) || auxFiles.get(expectedLogName);

  let rawLogContent = '';
  let logPath = '';
  let logSizeBytes = 0;

  if (logEntry) {
    logPath = logEntry.fullPath;
    logSizeBytes = logEntry.size;

    if (logSizeBytes > maxLogBytes) {
      // Truncate preserving head and tail
      const fd = await fs.promises.open(logPath, 'r');
      const headSize = Math.floor(maxLogBytes * 0.6);
      const tailSize = Math.floor(maxLogBytes * 0.4);

      const headBuf = Buffer.alloc(headSize);
      await fd.read(headBuf, 0, headSize, 0);

      const tailBuf = Buffer.alloc(tailSize);
      await fd.read(tailBuf, 0, tailSize, logSizeBytes - tailSize);
      await fd.close();

      const truncationNotice = '\n\n[... TEXLY LOG TRUNCATED DUE TO SIZE LIMIT ...]\n\n';
      rawLogContent = headBuf.toString('utf-8') + truncationNotice + tailBuf.toString('utf-8');

      // Write truncated log back to logPath for upload
      await fs.promises.writeFile(logPath, rawLogContent, 'utf-8');
      logSizeBytes = Buffer.byteLength(rawLogContent);
    } else {
      rawLogContent = await fs.promises.readFile(logPath, 'utf-8');
    }
  } else {
    // If no log file generated, write an empty log file in outDir
    logPath = path.join(workDirs.outDir, expectedLogName);
    rawLogContent = 'No LaTeX log file was generated during compilation.';
    await fs.promises.writeFile(logPath, rawLogContent, 'utf-8');
    logSizeBytes = Buffer.byteLength(rawLogContent);
  }

  return {
    pdfPath,
    pdfSizeBytes,
    synctexPath,
    synctexSizeBytes,
    logPath,
    logSizeBytes,
    rawLogContent,
    totalOutputFileCount,
  };
}
