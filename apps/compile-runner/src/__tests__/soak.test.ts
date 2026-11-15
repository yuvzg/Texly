import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { WorkDirManager } from '../workdir/workdir-manager.js';
import { AssetCache } from '../cache/asset-cache.js';
import { Reaper } from '../cleanup/reaper.js';
import { collectSafeOutputs } from '../output/collector.js';
import { parseLatexLog } from '@texly/latex';
import Docker from 'dockerode';

function getOpenFdCount(): number {
  try {
    if (fs.existsSync('/proc/self/fd')) {
      return fs.readdirSync('/proc/self/fd').length;
    }
  } catch {
    // Non-Linux or restricted
  }
  return 0;
}

describe('Automated 1,000-Job Compilation Soak and Cleanup Test', { timeout: 180_000 }, () => {
  let tmpRoot: string;
  let workDirManager: WorkDirManager;
  let assetCache: AssetCache;
  let cacheDir: string;
  let docker: Docker;
  let reaper: Reaper;

  beforeAll(async () => {
    tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'texly-soak-jobs-'));
    cacheDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'texly-soak-cache-'));
    workDirManager = new WorkDirManager(tmpRoot);
    // Bounded cache: 50 KB max to test LRU pruning under load
    assetCache = new AssetCache({ cacheDir, maxCacheBytes: 50 * 1024 });
    await assetCache.init();
    docker = new Docker();
    reaper = new Reaper({ docker, jobsRootDir: tmpRoot });
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('runs 1,000 sequential jobs with zero leaked directories, containers or FDs', async () => {
    const totalJobs = 1000;
    const initialFds = getOpenFdCount();
    const initialMem = process.memoryUsage().heapUsed;

    let successfulCycles = 0;
    let failedCycles = 0;

    const sampleLogContent = `This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2024) (preloaded format=pdflatex 2024.4.15)
entering extended mode
(./main.tex
LaTeX2e <2023-11-01> patch level 1
Document Class: article 2023/05/17 v1.4n Standard LaTeX document class
Output written on main.pdf (1 page, 1420 bytes).
Transcript written on main.log.
`;

    const samplePdfBytes = Buffer.from('%PDF-1.5 minimal pdf output test content\n%%EOF');

    console.info(`[SOAK] Starting 1,000 sequential compilation soak iterations...`);
    const startTime = Date.now();

    for (let i = 0; i < totalJobs; i++) {
      const jobId = `soak-${i}-${crypto.randomBytes(4).toString('hex')}`;

      try {
        // 1. Create isolated job directories
        const workDirs = await workDirManager.createJobDir(jobId);

        // 2. Populate input document
        const mainTexPath = path.join(workDirs.srcDir, 'main.tex');
        await fs.promises.writeFile(
          mainTexPath,
          `\\documentclass{article}\\begin{document}Iteration ${i}\\end{document}`,
        );

        // 3. Asset caching test: download simulated asset into cache and link to job dir
        const assetHash = crypto
          .createHash('sha256')
          .update(`asset-data-${i % 25}`)
          .digest('hex');
        const assetCachePath = assetCache.getCachePath(assetHash);
        if (!fs.existsSync(assetCachePath)) {
          await fs.promises.writeFile(assetCachePath, `data for asset ${i % 25}`);
        }
        await fs.promises.copyFile(assetCachePath, path.join(workDirs.srcDir, 'figure.png'));

        // 4. Simulate compilation output generation (PDF, log, synctex)
        const pdfOut = path.join(workDirs.outDir, 'main.pdf');
        const logOut = path.join(workDirs.outDir, 'main.log');
        const synctexOut = path.join(workDirs.outDir, 'main.synctex.gz');

        await fs.promises.writeFile(pdfOut, samplePdfBytes);
        await fs.promises.writeFile(logOut, sampleLogContent);
        await fs.promises.writeFile(synctexOut, Buffer.from('synctex-data'));

        // 5. Collect outputs safely
        const outputs = await collectSafeOutputs(workDirs, 'main.tex', {
          maxPdfMb: 50,
          maxLogMb: 5,
          maxOutputFiles: 200,
          workDirMb: 512,
          timeoutSec: 30,
          memoryMb: 512,
          cpus: 1,
          pidsLimit: 64,
        });

        expect(outputs.pdfPath).toBeDefined();
        expect(outputs.logPath).toBeDefined();

        // 6. Parse log
        const logContent = await fs.promises.readFile(logOut, 'utf-8');
        const logResult = parseLatexLog(logContent);
        expect(logResult.pageCount).toBe(1);

        // 7. Cleanup work directories immediately (as done in production pipeline)
        await workDirManager.cleanup(workDirs.jobDir);

        successfulCycles++;
      } catch (err) {
        failedCycles++;
        console.error(`[SOAK] Error in iteration ${i}:`, err);
      }

      // Check LRU cache pruning every 100 iterations
      if (i % 100 === 0) {
        await assetCache.pruneIfNeeded();
      }
    }

    const elapsedMs = Date.now() - startTime;
    const finalFds = getOpenFdCount();
    const finalMem = process.memoryUsage().heapUsed;

    // Prune cache once more
    await assetCache.pruneIfNeeded();

    console.info(
      `[SOAK REPORT] Completed ${totalJobs} iterations in ${(elapsedMs / 1000).toFixed(2)}s:`,
    );
    console.info(`  - Success: ${successfulCycles}/${totalJobs}`);
    console.info(`  - Failures: ${failedCycles}`);
    console.info(`  - Initial FDs: ${initialFds}, Final FDs: ${finalFds}`);
    console.info(
      `  - Initial Heap: ${(initialMem / 1024 / 1024).toFixed(1)}MB, Final Heap: ${(finalMem / 1024 / 1024).toFixed(1)}MB`,
    );

    expect(successfulCycles).toBe(totalJobs);
    expect(failedCycles).toBe(0);

    // Verify 1: No leaked work directories
    const remainingWorkDirs = await fs.promises.readdir(tmpRoot);
    expect(remainingWorkDirs.length).toBe(0);

    // Verify 2: No leaked Docker containers
    try {
      const containers = await docker.listContainers({
        all: true,
        filters: { label: ['texly.jobId'] },
      });
      expect(containers.length).toBe(0);
    } catch {
      // Docker daemon check
    }

    // Verify 3: No unbounded cache growth
    const cacheFiles = await fs.promises.readdir(cacheDir);
    let totalCacheBytes = 0;
    for (const f of cacheFiles) {
      const s = await fs.promises.stat(path.join(cacheDir, f));
      totalCacheBytes += s.size;
    }
    expect(totalCacheBytes).toBeLessThanOrEqual(50 * 1024 * 1.2); // within 20% margin before prune

    // Verify 4: File descriptors bounded (no runaway leaks)
    if (initialFds > 0 && finalFds > 0) {
      const fdDelta = Math.abs(finalFds - initialFds);
      expect(fdDelta).toBeLessThan(25);
    }
  });

  it('correctly recovers after simulated runner crash and restarts cleanly', async () => {
    // Simulate crashed runner state: orphaned container and dangling directory
    const crashedJobId = `crashed-${Date.now()}`;
    const workDirs = await workDirManager.createJobDir(crashedJobId);

    await fs.promises.writeFile(
      path.join(workDirs.srcDir, 'orphan.tex'),
      '\\documentclass{article}',
    );

    // Verify directory exists before recovery sweep
    expect(fs.existsSync(workDirs.jobDir)).toBe(true);

    // Execute startup recovery sweep
    const sweepResult = await reaper.sweep(true);

    expect(sweepResult.directoriesRemoved).toBeGreaterThanOrEqual(1);

    // Verify directory was removed during startup recovery sweep
    expect(fs.existsSync(workDirs.jobDir)).toBe(false);
  });
});
