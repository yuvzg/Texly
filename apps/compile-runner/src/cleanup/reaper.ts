import fs from 'node:fs';
import path from 'node:path';
import type Docker from 'dockerode';
import { logger } from '../logging/logger.js';

export interface ReaperOptions {
  docker: Docker;
  jobsRootDir: string;
  intervalMs?: number;
  dirStaleAgeMs?: number;
}

const DEFAULT_INTERVAL_MS = 60000; // 60 seconds
const DEFAULT_DIR_STALE_AGE_MS = 10 * 60 * 1000; // 10 minutes

export class Reaper {
  private docker: Docker;
  private jobsRootDir: string;
  private intervalMs: number;
  private dirStaleAgeMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(options: ReaperOptions) {
    this.docker = options.docker;
    this.jobsRootDir = path.resolve(options.jobsRootDir);
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.dirStaleAgeMs = options.dirStaleAgeMs ?? DEFAULT_DIR_STALE_AGE_MS;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.sweep().catch((err) => {
        logger.error({ err }, 'Error during scheduled reaper sweep');
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sweep(startupRecovery = false): Promise<{
    containersRemoved: number;
    directoriesRemoved: number;
  }> {
    if (this.isSweeping) return { containersRemoved: 0, directoriesRemoved: 0 };
    this.isSweeping = true;

    let containersRemoved = 0;
    let directoriesRemoved = 0;
    const now = Date.now();

    try {
      // 1. Sweep Docker containers labeled texly.job
      const containers = await this.docker.listContainers({
        all: true,
        filters: { label: ['texly.job'] },
      });

      for (const info of containers) {
        const jobId = info.Labels['texly.job'];
        const deadlineStr = info.Labels['texly.deadline'];
        const deadline = deadlineStr ? parseInt(deadlineStr, 10) : 0;

        // On startup recovery remove all orphaned texly.job containers;
        // during normal run remove if past deadline + 30 seconds or if dead/exited
        const isExpired = deadline > 0 && now > deadline + 30000;
        const isDeadOrExited = info.State === 'exited' || info.State === 'dead';

        if (startupRecovery || isExpired || isDeadOrExited) {
          try {
            const container = this.docker.getContainer(info.Id);
            await container.remove({ force: true, v: true });
            containersRemoved++;
            logger.info(
              { containerId: info.Id, jobId },
              'Reaper force-removed stale compile container',
            );
          } catch {
            // Ignore removal errors
          }
        }
      }

      // 2. Sweep stale job directories
      if (fs.existsSync(this.jobsRootDir)) {
        const entries = await fs.promises.readdir(this.jobsRootDir, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const dirPath = path.join(this.jobsRootDir, entry.name);

          try {
            const stat = await fs.promises.stat(dirPath);
            const ageMs = now - stat.mtimeMs;

            if (startupRecovery || ageMs > this.dirStaleAgeMs) {
              await fs.promises.rm(dirPath, { recursive: true, force: true });
              directoriesRemoved++;
              logger.info({ dirPath, ageMs }, 'Reaper removed stale job directory');
            }
          } catch {
            // Ignore
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Reaper sweep encounter error');
    } finally {
      this.isSweeping = false;
    }

    return { containersRemoved, directoriesRemoved };
  }
}
