import { Queue, type ConnectionOptions } from 'bullmq';
import {
  COMPILE_RESULTS_QUEUE,
  CompileResultV1Schema,
  type CompileResultV1,
  type CompilationDiagnostic,
  type CompilationStatus,
} from '@texly/shared';
import { logger } from '../logging/logger.js';

export interface PublishResultParams {
  compilationId: string;
  projectId: string;
  status: CompilationStatus;
  exitCode: number;
  durationMs: number;
  errorCount: number;
  warningCount: number;
  pageCount?: number | undefined;
  diagnostics: CompilationDiagnostic[];
  outputs?: {
    pdfKey?: string | undefined;
    synctexKey?: string | undefined;
    logKey?: string | undefined;
  };
  outputSizes?: {
    pdfBytes?: number | undefined;
    synctexBytes?: number | undefined;
    logBytes?: number | undefined;
  };
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

export class ResultPublisher {
  private resultsQueue: Queue;

  constructor(redisConnection: unknown) {
    this.resultsQueue = new Queue(COMPILE_RESULTS_QUEUE, {
      connection: redisConnection as ConnectionOptions,
    });
  }

  async publishStarted(compilationId: string, projectId: string): Promise<void> {
    try {
      await this.resultsQueue.add(
        'started',
        {
          compilationId,
          projectId,
          status: 'RUNNING',
          timestamp: new Date().toISOString(),
        },
        {
          jobId: `${compilationId}__started`,
          removeOnComplete: true,
        },
      );
      logger.info({ compilationId, projectId }, 'Published compile started result');
    } catch (err) {
      logger.error({ err, compilationId }, 'Failed to publish compile started result');
    }
  }

  async publishFinished(params: PublishResultParams): Promise<CompileResultV1> {
    const rawResult: CompileResultV1 = {
      version: 1,
      compilationId: params.compilationId,
      projectId: params.projectId,
      status: params.status,
      exitCode: params.exitCode,
      durationMs: Math.max(0, params.durationMs),
      errorCount: Math.max(0, params.errorCount),
      warningCount: Math.max(0, params.warningCount),
      ...(params.pageCount !== undefined ? { pageCount: params.pageCount } : {}),
      diagnostics: params.diagnostics,
      outputs: {
        ...(params.outputs?.pdfKey ? { pdfKey: params.outputs.pdfKey } : {}),
        ...(params.outputs?.synctexKey ? { synctexKey: params.outputs.synctexKey } : {}),
        ...(params.outputs?.logKey ? { logKey: params.outputs.logKey } : {}),
      },
      outputSizes: {
        ...(params.outputSizes?.pdfBytes !== undefined
          ? { pdfBytes: params.outputSizes.pdfBytes }
          : {}),
        ...(params.outputSizes?.synctexBytes !== undefined
          ? { synctexBytes: params.outputSizes.synctexBytes }
          : {}),
        ...(params.outputSizes?.logBytes !== undefined
          ? { logBytes: params.outputSizes.logBytes }
          : {}),
      },
      ...(params.errorCode ? { errorCode: params.errorCode } : {}),
      ...(params.errorMessage ? { errorMessage: params.errorMessage } : {}),
    };

    const validated = CompileResultV1Schema.parse(rawResult);

    await this.resultsQueue.add('finished', validated, {
      jobId: `${params.compilationId}__finished`,
      removeOnComplete: { age: 86400 },
    });

    logger.info(
      {
        compilationId: params.compilationId,
        status: validated.status,
        errorCount: validated.errorCount,
        warningCount: validated.warningCount,
      },
      'Published compile finished result',
    );

    return validated;
  }

  async close(): Promise<void> {
    await this.resultsQueue.close();
  }
}
