import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface JobWorkDir {
  jobDir: string;
  workDir: string;
  srcDir: string;
  outDir: string;
  auxDir: string;
}

export class WorkDirManager {
  constructor(
    private readonly jobsRootDir: string,
    private readonly fallbackImage = 'texly/texlive:dev',
  ) {}

  async createJobDir(compilationId: string): Promise<JobWorkDir> {
    const jobDir = path.resolve(this.jobsRootDir, compilationId);
    const workDir = path.join(jobDir, 'work');
    const srcDir = path.join(workDir, 'src');
    const outDir = path.join(workDir, 'out');
    const auxDir = path.join(workDir, 'aux');

    await fs.promises.mkdir(srcDir, { recursive: true, mode: 0o777 });
    await fs.promises.mkdir(outDir, { recursive: true, mode: 0o777 });
    await fs.promises.mkdir(auxDir, { recursive: true, mode: 0o777 });

    // Explicitly chmod all directories to ensure container user (UID 10001) has full access
    await fs.promises.chmod(jobDir, 0o777);
    await fs.promises.chmod(workDir, 0o777);
    await fs.promises.chmod(srcDir, 0o777);
    await fs.promises.chmod(outDir, 0o777);
    await fs.promises.chmod(auxDir, 0o777);

    return {
      jobDir,
      workDir,
      srcDir,
      outDir,
      auxDir,
    };
  }

  async cleanup(jobDir: string): Promise<void> {
    if (!fs.existsSync(jobDir)) {
      return;
    }

    try {
      await fs.promises.rm(jobDir, { recursive: true, force: true });
    } catch {
      // If host cannot remove files created by UID 10001 (e.g. subdirectories created in container),
      // use the container image to remove them cleanly
      try {
        execSync(
          `docker run --rm -v "${jobDir}:/clean_dir" "${this.fallbackImage}" rm -rf /clean_dir/*`,
          { stdio: 'ignore' },
        );
        await fs.promises.rm(jobDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
