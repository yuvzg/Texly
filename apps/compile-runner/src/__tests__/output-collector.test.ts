import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectSafeOutputs, OutputCollectionError } from '../output/collector.js';
import type { JobWorkDir } from '../workdir/workdir-manager.js';
import type { CompileLimits } from '@texly/shared';

describe('Safe Output Collector', () => {
  let tmpDir: string;
  let workDirs: JobWorkDir;

  const defaultLimits: CompileLimits = {
    timeoutSec: 60,
    memoryMb: 1024,
    cpus: 1,
    pidsLimit: 256,
    maxPdfMb: 10,
    maxLogMb: 1, // 1 MB log limit
    maxOutputFiles: 50,
    workDirMb: 100,
  };

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'texly-test-output-'));
    const workDir = path.join(tmpDir, 'work');
    const srcDir = path.join(workDir, 'src');
    const outDir = path.join(workDir, 'out');
    const auxDir = path.join(workDir, 'aux');

    await fs.promises.mkdir(srcDir, { recursive: true });
    await fs.promises.mkdir(outDir, { recursive: true });
    await fs.promises.mkdir(auxDir, { recursive: true });

    workDirs = {
      jobDir: tmpDir,
      workDir,
      srcDir,
      outDir,
      auxDir,
    };
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('safely collects PDF, SyncTeX, and Log outputs', async () => {
    await fs.promises.writeFile(
      path.join(workDirs.outDir, 'main.pdf'),
      '%PDF-1.5 fake pdf content',
    );
    await fs.promises.writeFile(
      path.join(workDirs.outDir, 'main.synctex.gz'),
      'fake synctex content',
    );
    await fs.promises.writeFile(
      path.join(workDirs.outDir, 'main.log'),
      'Output written on /work/out/main.pdf (1 page, 1000 bytes).',
    );

    const result = await collectSafeOutputs(workDirs, 'main.tex', defaultLimits);
    expect(result.pdfPath).toBeDefined();
    expect(result.pdfSizeBytes).toBeGreaterThan(0);
    expect(result.synctexPath).toBeDefined();
    expect(result.logPath).toBeDefined();
    expect(result.rawLogContent).toContain('Output written on');
  });

  it('ignores and does not collect symlinks in output directories', async () => {
    const sensitiveFile = path.join(tmpDir, 'sensitive.txt');
    await fs.promises.writeFile(sensitiveFile, 'SECRET');

    // Create a symlink named main.pdf pointing to sensitive file
    const symlinkPath = path.join(workDirs.outDir, 'main.pdf');
    await fs.promises.symlink(sensitiveFile, symlinkPath);

    const result = await collectSafeOutputs(workDirs, 'main.tex', defaultLimits);
    // Because main.pdf was a symlink, it must NOT be collected as a valid regular file
    expect(result.pdfPath).toBeUndefined();
  });

  it('enforces maximum PDF size limit', async () => {
    const bigPdfPath = path.join(workDirs.outDir, 'main.pdf');
    // Write 2 MB when limit is 1 MB
    const smallLimits = { ...defaultLimits, maxPdfMb: 1 };
    const bigBuffer = Buffer.alloc(2 * 1024 * 1024, 0x41);
    await fs.promises.writeFile(bigPdfPath, bigBuffer);

    await expect(collectSafeOutputs(workDirs, 'main.tex', smallLimits)).rejects.toThrowError(
      OutputCollectionError,
    );
    await expect(collectSafeOutputs(workDirs, 'main.tex', smallLimits)).rejects.toThrow(
      /exceeds limit/i,
    );
  });

  it('truncates oversized log while preserving head and tail', async () => {
    const logPath = path.join(workDirs.outDir, 'main.log');
    const smallLimits = { ...defaultLimits, maxLogMb: 1 }; // 1 MB limit

    const headMarker = 'HEAD_LOG_START_12345';
    const tailMarker = 'TAIL_LOG_END_67890';
    const filler = 'A'.repeat(1.5 * 1024 * 1024); // 1.5 MB

    await fs.promises.writeFile(logPath, `${headMarker}\n${filler}\n${tailMarker}`);

    const result = await collectSafeOutputs(workDirs, 'main.tex', smallLimits);
    expect(result.rawLogContent).toContain('TEXLY LOG TRUNCATED');
    expect(result.rawLogContent).toContain(headMarker);
    expect(result.rawLogContent).toContain(tailMarker);
  });

  it('enforces maximum output file count limit', async () => {
    const strictLimits = { ...defaultLimits, maxOutputFiles: 5 };
    for (let i = 0; i < 10; i++) {
      await fs.promises.writeFile(path.join(workDirs.outDir, `file_${i}.txt`), 'data');
    }

    await expect(collectSafeOutputs(workDirs, 'main.tex', strictLimits)).rejects.toThrowError(
      OutputCollectionError,
    );
    await expect(collectSafeOutputs(workDirs, 'main.tex', strictLimits)).rejects.toThrow(
      /maximum allowed limit/i,
    );
  });
});
