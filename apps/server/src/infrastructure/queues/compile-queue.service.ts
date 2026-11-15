import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { COMPILE_QUEUE, type CompileJobV1 } from '@texly/shared';
import { logger } from '../../logging/logger.js';

export interface CompileQueueServiceOptions {
  connection?: ConnectionOptions;
  queueInstance?: Queue<CompileJobV1>;
}

export class CompileQueueService {
  private readonly queue: Queue<CompileJobV1>;

  constructor(options: CompileQueueServiceOptions) {
    if (options.queueInstance) {
      this.queue = options.queueInstance;
    } else {
      this.queue = new Queue<CompileJobV1>(COMPILE_QUEUE, {
        connection: options.connection ?? { host: '127.0.0.1', port: 6379 },
      });
    }
  }

  public get rawQueue(): Queue<CompileJobV1> {
    return this.queue;
  }

  public async addCompileJob(job: CompileJobV1, priority?: number): Promise<void> {
    await this.queue.add('compile-job', job, {
      jobId: job.compilationId,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
      ...(priority !== undefined ? { priority } : {}),
    });
    logger.info(
      { compilationId: job.compilationId, projectId: job.projectId },
      'Enqueued compile job',
    );
  }

  public async removeJob(compilationId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(compilationId);
      if (!job) {
        return false;
      }
      const state = await job.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
        await job.remove();
        logger.info({ compilationId, state }, 'Removed pending compile job from queue');
        return true;
      }
      logger.debug(
        { compilationId, state },
        'Compile job cannot be removed as it is already active or finished',
      );
      return false;
    } catch (err) {
      logger.warn({ err, compilationId }, 'Failed to remove compile job from queue');
      return false;
    }
  }

  public async getJobState(compilationId: string): Promise<string | null> {
    try {
      const job = await this.queue.getJob(compilationId);
      if (!job) return null;
      return await job.getState();
    } catch {
      return null;
    }
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
