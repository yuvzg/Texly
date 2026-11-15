import type { CompilationsRepository } from './compilations.repository.js';
import type { CompileQueueService } from '../../infrastructure/queues/compile-queue.service.js';
import type { RealtimeEmitter } from '../../realtime/realtime-emitter.js';
import { logger } from '../../logging/logger.js';

export interface ReconcilerOptions {
  intervalMs?: number;
  staleQueuedThresholdMs?: number;
  staleRunningThresholdMs?: number;
}

export class CompilationsReconciler {
  private timer?: NodeJS.Timeout | undefined;
  private readonly intervalMs: number;
  private readonly staleQueuedThresholdMs: number;
  private readonly staleRunningThresholdMs: number;
  private running = false;

  constructor(
    private readonly compilationsRepo: CompilationsRepository,
    private readonly compileQueueService: CompileQueueService,
    private readonly realtimeEmitter: RealtimeEmitter,
    options: ReconcilerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 30000; // 30 seconds
    this.staleQueuedThresholdMs = options.staleQueuedThresholdMs ?? 30000; // 30 seconds
    this.staleRunningThresholdMs = options.staleRunningThresholdMs ?? (240 + 60) * 1000; // 300 seconds
  }

  public start(): void {
    if (this.timer) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.reconcile().catch((err) => {
        logger.error({ err }, 'Error during compilation reconciliation cycle');
      });
    }, this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, 'Compilations reconciler started');
  }

  public stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public async reconcile(): Promise<{ recoveredQueued: number; recoveredRunning: number }> {
    let recoveredQueued = 0;
    let recoveredRunning = 0;

    const now = Date.now();

    // 1. Check stale QUEUED compilations
    const queuedThreshold = new Date(now - this.staleQueuedThresholdMs);
    const staleQueued = await this.compilationsRepo.findStaleQueued(queuedThreshold);

    for (const comp of staleQueued) {
      const jobState = await this.compileQueueService.getJobState(comp.id);
      if (!jobState) {
        logger.warn(
          { compilationId: comp.id, projectId: comp.projectId },
          'Stale QUEUED compilation found with no BullMQ job. Marking FAILED(INFRA)',
        );
        await this.compilationsRepo.update(comp.id, {
          status: 'FAILED',
          errorCode: 'ORPHANED_QUEUED_JOB',
          finishedAt: new Date(),
        });
        await this.realtimeEmitter.emitCompilationFinished({
          projectId: comp.projectId,
          compilationId: comp.id,
          status: 'FAILED',
          timestamp: new Date().toISOString(),
        });
        recoveredQueued++;
      }
    }

    // 2. Check stale RUNNING compilations
    const runningThreshold = new Date(now - this.staleRunningThresholdMs);
    const staleRunning = await this.compilationsRepo.findStaleRunning(runningThreshold);

    for (const comp of staleRunning) {
      const jobState = await this.compileQueueService.getJobState(comp.id);
      if (jobState !== 'active') {
        logger.warn(
          { compilationId: comp.id, projectId: comp.projectId, jobState },
          'Stale RUNNING compilation exceeded deadline. Marking FAILED(INFRA)',
        );
        await this.compilationsRepo.update(comp.id, {
          status: 'FAILED',
          errorCode: 'RUNNER_TIMEOUT_OR_LOST',
          finishedAt: new Date(),
        });
        await this.realtimeEmitter.emitCompilationFinished({
          projectId: comp.projectId,
          compilationId: comp.id,
          status: 'FAILED',
          timestamp: new Date().toISOString(),
        });
        recoveredRunning++;
      }
    }

    if (recoveredQueued > 0 || recoveredRunning > 0) {
      logger.info(
        { recoveredQueued, recoveredRunning },
        'Compilation reconciliation sweep completed with recoveries',
      );
    }

    return { recoveredQueued, recoveredRunning };
  }
}
