import fs from 'node:fs';
import type { DockerManager } from '../container/docker-manager.js';

export interface HealthCheckResult {
  healthy: boolean;
  docker: boolean;
  diskFreePercent: number;
  diskHealthy: boolean;
}

export class HealthMonitor {
  constructor(
    private readonly dockerManager: DockerManager,
    private readonly jobsRootDir: string,
    private readonly minDiskFreePercent: number = 15,
  ) {}

  async checkHealth(): Promise<HealthCheckResult> {
    const dockerOk = await this.dockerManager.ping();

    let diskFreePercent = 100;
    let diskHealthy = true;

    try {
      if (fs.existsSync(this.jobsRootDir)) {
        const stats = await fs.promises.statfs(this.jobsRootDir);
        if (stats.blocks > 0) {
          diskFreePercent = Math.round((stats.bavail / stats.blocks) * 100);
          diskHealthy = diskFreePercent >= this.minDiskFreePercent;
        }
      }
    } catch {
      // If statfs fails or dir does not exist yet, treat disk as ok
      diskHealthy = true;
    }

    const healthy = dockerOk && diskHealthy;

    return {
      healthy,
      docker: dockerOk,
      diskFreePercent,
      diskHealthy,
    };
  }
}
