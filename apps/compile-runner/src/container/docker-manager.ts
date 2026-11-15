import Docker from 'dockerode';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { CompileJobV1 } from '@texly/shared';
import { buildLatexmkArgv } from './command-builder.js';
import type { JobWorkDir } from '../workdir/workdir-manager.js';

export interface ContainerExecutionResult {
  exitCode: number;
  oomKilled: boolean;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface DockerManagerOptions {
  socketPath?: string;
  image: string;
  texmfCnfPath: string;
}

export class DockerManager {
  private docker: Docker;
  private image: string;
  private texmfCnfPath: string;

  constructor(options: DockerManagerOptions) {
    this.docker = new Docker({ socketPath: options.socketPath || '/var/run/docker.sock' });
    this.image = options.image;
    this.texmfCnfPath = path.resolve(options.texmfCnfPath);
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.docker.ping();
      return res.toString().toLowerCase().includes('ok');
    } catch {
      return false;
    }
  }

  getDockerClient(): Docker {
    return this.docker;
  }

  async runCompileContainer(
    job: CompileJobV1,
    workDirs: JobWorkDir,
  ): Promise<ContainerExecutionResult> {
    const limits = job.limits;
    const timeoutSec = Math.max(1, limits.timeoutSec);
    const hostDeadlineMs = (timeoutSec + 5) * 1000;
    const deadlineEpoch = Date.now() + hostDeadlineMs;

    const cmd = buildLatexmkArgv({
      engine: job.engine,
      bibTool: job.bibTool,
      mainFile: job.mainFile,
      draft: job.draft,
      limits: job.limits,
    });

    const memoryBytes = limits.memoryMb * 1024 * 1024;
    const nanoCpus = Math.floor(limits.cpus * 1e9);

    // Hard-coded security configuration per COMPILATION_ENGINE.md
    const container = await this.docker.createContainer({
      Image: this.image,
      Cmd: cmd,
      WorkingDir: '/work',
      User: '10001:10001',
      NetworkDisabled: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      Env: [
        'TEXMFCNF=/opt/texly/:',
        'TEXMFVAR=/tmp/texmf-var',
        'TEXMFHOME=/tmp/texmf-home',
        'HOME=/tmp',
        'SOURCE_DATE_EPOCH=1700000000',
      ],
      Labels: {
        'texly.job': job.compilationId,
        'texly.deadline': String(deadlineEpoch),
      },
      HostConfig: {
        NetworkMode: 'none',
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        PidsLimit: limits.pidsLimit,
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // Same as memory -> no swap, OOM kill at cap
        NanoCpus: nanoCpus,
        Ulimits: [
          { Name: 'nofile', Soft: 1024, Hard: 1024 },
          { Name: 'nproc', Soft: limits.pidsLimit, Hard: limits.pidsLimit },
          { Name: 'fsize', Soft: 104857600, Hard: 104857600 }, // 100 MiB max file size
          { Name: 'core', Soft: 0, Hard: 0 },
        ],
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=64m',
        },
        Binds: [`${workDirs.workDir}:/work:rw`, `${this.texmfCnfPath}:/opt/texly/texmf.cnf:ro`],
        AutoRemove: false,
      },
      StopTimeout: 1,
    });

    let timedOut = false;
    let timerId: NodeJS.Timeout | undefined;
    const startTime = Date.now();

    try {
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const stdoutStream = new PassThrough();
      const stderrStream = new PassThrough();
      stdoutStream.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      stderrStream.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      await container.start();

      // Host-side deadline watchdog
      const timeoutPromise = new Promise<{ isTimeout: boolean }>((resolve) => {
        timerId = setTimeout(async () => {
          timedOut = true;
          try {
            await container.kill({ signal: 'SIGKILL' });
          } catch {
            // Container may have already terminated
          }
          resolve({ isTimeout: true });
        }, hostDeadlineMs);
      });

      const waitPromise = container.wait().then((res) => ({
        isTimeout: false,
        statusCode: (res as { StatusCode?: number }).StatusCode ?? 0,
      }));

      const raceResult = await Promise.race([waitPromise, timeoutPromise]);

      if (raceResult.isTimeout) {
        timedOut = true;
      }

      const durationMs = Date.now() - startTime;

      // Inspect container for exit status and OOM
      const inspectData = await container.inspect();
      const oomKilled = inspectData.State?.OOMKilled ?? false;
      const exitCode = timedOut ? 124 : oomKilled ? 137 : (inspectData.State?.ExitCode ?? 0);

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');

      return {
        exitCode,
        oomKilled,
        timedOut,
        durationMs,
        stdout,
        stderr,
      };
    } finally {
      if (timerId) {
        clearTimeout(timerId);
      }
      try {
        await container.remove({ force: true, v: true });
      } catch {
        // Container cleanup error ignored
      }
    }
  }
}
