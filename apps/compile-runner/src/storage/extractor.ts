import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import { pipeline } from 'node:stream/promises';

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'EXTRACTION_FAILED',
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ExtractionOptions {
  maxFiles?: number;
  maxTotalBytes?: number;
}

const DEFAULT_MAX_FILES = 1000;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024; // 512 MB

export async function safeExtractTar(
  archivePath: string,
  targetDir: string,
  options: ExtractionOptions = {},
): Promise<{ extractedFiles: string[]; totalBytes: number }> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_BYTES;

  const resolvedTargetDir = path.resolve(targetDir);
  await fs.promises.mkdir(resolvedTargetDir, { recursive: true });

  const seenPaths = new Set<string>();
  const extractedFiles: string[] = [];
  let fileCount = 0;
  let totalBytes = 0;

  // Check if file is gzipped (starts with 0x1f 0x8b)
  const fd = await fs.promises.open(archivePath, 'r');
  const magic = Buffer.alloc(2);
  await fd.read(magic, 0, 2, 0);
  await fd.close();
  const isGzipped = magic[0] === 0x1f && magic[1] === 0x8b;

  const extract = tar.extract();
  const sourceStream = fs.createReadStream(archivePath);
  const decompressor = isGzipped ? zlib.createGunzip() : null;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    function fail(err: unknown) {
      if (settled) return;
      settled = true;
      try {
        sourceStream.destroy();
        if (decompressor) decompressor.destroy();
        extract.destroy();
      } catch {
        // Ignore
      }
      reject(err instanceof Error ? err : new ExtractionError(String(err)));
    }

    extract.on('entry', async (header, stream, next) => {
      try {
        if (settled) {
          stream.resume();
          return;
        }

        const entryType = header.type;

        // 1. Strictly forbid symlinks, hardlinks, FIFOs, devices
        if (entryType === 'symlink' || entryType === 'link') {
          stream.resume();
          fail(
            new ExtractionError(
              `Archive contains forbidden link entry: '${header.name}' (type=${entryType})`,
              'FORBIDDEN_LINK',
            ),
          );
          return;
        }

        if (entryType !== 'file' && entryType !== 'directory') {
          stream.resume();
          fail(
            new ExtractionError(
              `Archive contains forbidden special file: '${header.name}' (type=${entryType})`,
              'FORBIDDEN_SPECIAL_FILE',
            ),
          );
          return;
        }

        // 2. Validate entry path
        const entryName = header.name.trim();

        if (
          path.isAbsolute(entryName) ||
          entryName.startsWith('/') ||
          entryName.startsWith('\\') ||
          entryName.includes('\0')
        ) {
          stream.resume();
          fail(
            new ExtractionError(
              `Archive entry path is absolute or invalid: '${entryName}'`,
              'PATH_TRAVERSAL',
            ),
          );
          return;
        }

        // Check for path traversal segments (..)
        const normalizedRelative = path.normalize(entryName);
        if (
          normalizedRelative === '..' ||
          normalizedRelative.startsWith(`..${path.sep}`) ||
          normalizedRelative.startsWith('../') ||
          normalizedRelative.startsWith('..\\')
        ) {
          stream.resume();
          fail(
            new ExtractionError(
              `Archive entry attempts path traversal: '${entryName}'`,
              'PATH_TRAVERSAL',
            ),
          );
          return;
        }

        const destPath = path.resolve(resolvedTargetDir, normalizedRelative);
        if (!destPath.startsWith(resolvedTargetDir + path.sep) && destPath !== resolvedTargetDir) {
          stream.resume();
          fail(
            new ExtractionError(
              `Archive entry resolves outside target directory: '${entryName}' -> '${destPath}'`,
              'PATH_TRAVERSAL',
            ),
          );
          return;
        }

        // 3. Case-insensitive collision detection
        const lowercaseKey = normalizedRelative.toLowerCase();
        if (entryType === 'file') {
          if (seenPaths.has(lowercaseKey)) {
            stream.resume();
            fail(
              new ExtractionError(
                `Archive contains duplicate or case-colliding file: '${entryName}'`,
                'DUPLICATE_ENTRY',
              ),
            );
            return;
          }
          seenPaths.add(lowercaseKey);

          fileCount++;
          if (fileCount > maxFiles) {
            stream.resume();
            fail(
              new ExtractionError(
                `Archive exceeds maximum file count limit (${maxFiles})`,
                'MAX_FILES_EXCEEDED',
              ),
            );
            return;
          }
        }

        // 4. Extract directory or file
        if (entryType === 'directory') {
          await fs.promises.mkdir(destPath, { recursive: true });
          stream.resume();
          next();
          return;
        }

        // For file: ensure parent directory exists
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

        // Track entry size
        const writeStream = fs.createWriteStream(destPath, {
          flags: 'w',
          mode: 0o644,
        });

        stream.on('data', (chunk: unknown) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
          totalBytes += buffer.length;
          if (totalBytes > maxTotalBytes) {
            stream.destroy();
            fail(
              new ExtractionError(
                `Extracted archive contents exceed maximum size limit of ${maxTotalBytes} bytes`,
                'SIZE_EXCEEDED',
              ),
            );
          }
        });

        await pipeline(stream, writeStream);
        extractedFiles.push(normalizedRelative);

        if (!settled) {
          next();
        }
      } catch (err) {
        stream.resume();
        fail(err);
      }
    });

    extract.on('finish', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });

    extract.on('error', fail);
    sourceStream.on('error', fail);
    if (decompressor) {
      decompressor.on('error', fail);
    }

    if (decompressor) {
      sourceStream.pipe(decompressor).pipe(extract);
    } else {
      sourceStream.pipe(extract);
    }
  });

  // Defense-in-depth: Remove any .latexmkrc or latexmkrc extracted in the target dir
  const forbiddenConfigNames = ['.latexmkrc', 'latexmkrc'];
  for (const name of forbiddenConfigNames) {
    const fullPath = path.join(resolvedTargetDir, name);
    try {
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    } catch {
      // Ignore
    }
  }

  return {
    extractedFiles,
    totalBytes,
  };
}
