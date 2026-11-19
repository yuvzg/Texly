import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { COMPILE_RESULTS_QUEUE, CompileResultV1Schema, type CompileResultV1 } from '@texly/shared';
import type { PrismaClient, DiagnosticLevel } from '@texly/db';
import { withTransaction } from '@texly/db';
import { logger } from '../../logging/logger.js';
import type { CompilationsRepository } from './compilations.repository.js';
import type { StorageService } from '../../infrastructure/storage/storage.interface.js';
import type { RealtimeEmitter } from '../../realtime/realtime-emitter.js';

export interface StartedMessagePayload {
  compilationId: string;
  projectId: string;
  status: 'RUNNING';
  timestamp: string;
  workerId?: string | undefined;
}

export class CompilationsWorker {
  private worker?: Worker | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly compilationsRepo: CompilationsRepository,
    private readonly storageService: StorageService,
    private readonly realtimeEmitter: RealtimeEmitter,
    private readonly redisConnection: unknown,
  ) {}

  public start(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(
      COMPILE_RESULTS_QUEUE,
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: this.redisConnection as ConnectionOptions,
        concurrency: 10,
      },
    );

    this.worker.on('error', (err) => {
      logger.error({ err }, 'Error in compile-results worker');
    });

    this.worker.on('failed', (job, err) => {
      logger.error({ err, jobId: job?.id }, 'Job failed in compile-results worker');
    });

    logger.info('CompilationsWorker started listening to compile-results queue');
    return this.worker;
  }

  public async processJob(job: Job): Promise<void> {
    const jobName = job.name;
    logger.debug({ jobId: job.id, jobName }, 'Processing compile result job');

    if (jobName === 'started') {
      await this.handleStarted(job.data as StartedMessagePayload);
    } else if (jobName === 'finished') {
      await this.handleFinished(job.data);
    } else {
      logger.warn({ jobName, jobId: job.id }, 'Unknown job name on compile-results queue');
    }
  }

  public async handleStarted(payload: StartedMessagePayload): Promise<void> {
    const { compilationId, projectId } = payload;
    const compilation = await this.compilationsRepo.findById(compilationId);

    if (!compilation) {
      logger.warn({ compilationId }, 'Received started event for non-existent compilation');
      return;
    }

    if (compilation.status !== 'QUEUED') {
      logger.debug(
        { compilationId, status: compilation.status },
        'Ignoring started event for non-QUEUED compilation',
      );
      return;
    }

    const startedAt = new Date();
    await this.compilationsRepo.update(compilationId, {
      status: 'RUNNING',
      startedAt,
      workerId: payload.workerId ?? null,
    });

    await this.realtimeEmitter.emitCompilationStarted({
      projectId,
      compilationId,
      status: 'RUNNING',
      timestamp: startedAt.toISOString(),
    });

    logger.info({ compilationId, projectId }, 'Compilation marked RUNNING');
  }

  public async handleFinished(data: unknown): Promise<void> {
    const parsed = CompileResultV1Schema.safeParse(data);
    if (!parsed.success) {
      logger.error(
        { errors: parsed.error.errors, data },
        'Invalid compile finished result payload',
      );
      return;
    }

    const result: CompileResultV1 = parsed.data;
    const { compilationId, projectId } = result;

    const compilation = await this.compilationsRepo.findById(compilationId);
    if (!compilation) {
      logger.warn({ compilationId }, 'Received finished event for non-existent compilation');
      return;
    }

    // Never regress from terminal states
    if (
      compilation.status === 'SUCCEEDED' ||
      compilation.status === 'FAILED' ||
      compilation.status === 'CANCELLED' ||
      compilation.status === 'SUPERSEDED'
    ) {
      logger.info(
        { compilationId, currentStatus: compilation.status },
        'Compilation already in terminal state; ignoring late finished message',
      );
      return;
    }

    let finalStatus = result.status;
    let errorCode = result.errorCode;

    const workspaceId = (compilation as { project?: { workspaceId: string } | null }).project?.workspaceId;
    const expectedPdfKey = workspaceId
      ? this.storageService.buildKey.compilation(
          workspaceId,
          compilation.projectId,
          compilation.id,
          'output.pdf',
        )
      : null;
    const expectedSynctexKey = workspaceId
      ? this.storageService.buildKey.compilation(
          workspaceId,
          compilation.projectId,
          compilation.id,
          'output.synctex.gz',
        )
      : null;
    const expectedLogKey = workspaceId
      ? this.storageService.buildKey.compilation(
          workspaceId,
          compilation.projectId,
          compilation.id,
          'compile.log',
        )
      : null;

    const actualPdfKey = result.outputs.pdfKey && expectedPdfKey ? expectedPdfKey : null;
    const actualSynctexKey = result.outputs.synctexKey && expectedSynctexKey ? expectedSynctexKey : null;
    const actualLogKey = result.outputs.logKey && expectedLogKey ? expectedLogKey : null;

    // Verify uploaded artifacts via HEAD requests
    if (finalStatus === 'SUCCEEDED' && actualPdfKey) {
      const head = await this.storageService.head(actualPdfKey);
      if (!head || head.sizeBytes === 0) {
        logger.error(
          { compilationId, pdfKey: actualPdfKey },
          'PDF artifact missing or empty after compilation succeeded, marking FAILED(INFRA)',
        );
        finalStatus = 'FAILED';
        errorCode = 'INFRA_ARTIFACT_MISSING';
      }
    }

    // Transactionally update compilation and insert diagnostics
    const finishedAt = new Date();
    await withTransaction(this.prisma, async (tx) => {
      await this.compilationsRepo.update(
        compilationId,
        {
          status: finalStatus,
          finishedAt,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          errorCode: errorCode ?? null,
          pdfKey: finalStatus === 'SUCCEEDED' ? actualPdfKey : null,
          pdfSizeBytes:
            result.outputSizes.pdfBytes !== undefined ? BigInt(result.outputSizes.pdfBytes) : null,
          pageCount: result.pageCount ?? null,
          synctexKey: actualSynctexKey,
          logKey: actualLogKey,
          errorCount: result.errorCount,
          warningCount: result.warningCount,
        },
        tx,
      );

      // Save diagnostics
      if (result.diagnostics.length > 0) {
        const levelMap: Record<string, DiagnosticLevel> = {
          error: 'ERROR',
          warning: 'WARNING',
          info: 'INFO',
        };

        const diagnosticLogs = result.diagnostics.map((diag, idx) => ({
          ordinal: diag.ordinal ?? idx,
          level: levelMap[diag.level] ?? 'INFO',
          file: diag.file,
          line: diag.line,
          message: diag.message,
          context: diag.context ?? null,
          kind: diag.kind ?? null,
        }));
        await this.compilationsRepo.createLogs(compilationId, diagnosticLogs, tx);
      }
    });

    await this.realtimeEmitter.emitCompilationFinished({
      projectId,
      compilationId,
      status: finalStatus,
      durationMs: result.durationMs,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      hasPdf: finalStatus === 'SUCCEEDED' && !!actualPdfKey,
      timestamp: finishedAt.toISOString(),
    });

    logger.info(
      {
        compilationId,
        projectId,
        status: finalStatus,
        durationMs: result.durationMs,
        errors: result.errorCount,
        warnings: result.warningCount,
      },
      'Compilation finished and persisted',
    );
  }

  public async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = undefined;
    }
  }
}
