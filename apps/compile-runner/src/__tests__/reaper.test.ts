import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type Docker from 'dockerode';
import { Reaper } from '../cleanup/reaper.js';

describe('Reaper', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'texly-test-reaper-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('sweeps stale job directories older than threshold', async () => {
    const staleDir = path.join(tmpDir, 'stale-job-1');
    const freshDir = path.join(tmpDir, 'fresh-job-2');

    await fs.promises.mkdir(staleDir, { recursive: true });
    await fs.promises.mkdir(freshDir, { recursive: true });

    // Set staleDir mtime to 15 minutes ago
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    await fs.promises.utimes(staleDir, fifteenMinsAgo, fifteenMinsAgo);

    const mockDocker = {
      listContainers: vi.fn().mockResolvedValue([]),
    } as unknown as Docker;

    const reaper = new Reaper({
      docker: mockDocker,
      jobsRootDir: tmpDir,
      dirStaleAgeMs: 10 * 60 * 1000, // 10 minutes
    });

    const result = await reaper.sweep(false);
    expect(result.directoriesRemoved).toBe(1);
    expect(fs.existsSync(staleDir)).toBe(false);
    expect(fs.existsSync(freshDir)).toBe(true);
  });

  it('removes all job directories during startup recovery sweep', async () => {
    const dir1 = path.join(tmpDir, 'job-1');
    const dir2 = path.join(tmpDir, 'job-2');

    await fs.promises.mkdir(dir1, { recursive: true });
    await fs.promises.mkdir(dir2, { recursive: true });

    const mockDocker = {
      listContainers: vi.fn().mockResolvedValue([]),
    } as unknown as Docker;

    const reaper = new Reaper({
      docker: mockDocker,
      jobsRootDir: tmpDir,
    });

    const result = await reaper.sweep(true); // startupRecovery = true
    expect(result.directoriesRemoved).toBe(2);
    expect(fs.existsSync(dir1)).toBe(false);
    expect(fs.existsSync(dir2)).toBe(false);
  });

  it('force-removes expired containers labeled texly.job', async () => {
    const mockContainer = {
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const mockDocker = {
      listContainers: vi.fn().mockResolvedValue([
        {
          Id: 'c123',
          Labels: {
            'texly.job': 'job-abc',
            'texly.deadline': String(Date.now() - 60000), // expired 60s ago
          },
          State: 'running',
        },
      ]),
      getContainer: vi.fn().mockReturnValue(mockContainer),
    } as unknown as Docker;

    const reaper = new Reaper({
      docker: mockDocker,
      jobsRootDir: tmpDir,
    });

    const result = await reaper.sweep(false);
    expect(result.containersRemoved).toBe(1);
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true, v: true });
  });
});
