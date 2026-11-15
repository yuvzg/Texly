import type { Server as SocketIOServer } from 'socket.io';
import type { Redis } from 'ioredis';
import type {
  CompilationQueuedEvent,
  CompilationStartedEvent,
  CompilationFinishedEvent,
} from '@texly/shared';
import { logger } from '../logging/logger.js';

export interface RealtimeEmitterOptions {
  io?: SocketIOServer | undefined;
  redisPublisher?: Redis | undefined;
}

export class RealtimeEmitter {
  private io?: SocketIOServer | undefined;
  private redisPublisher?: Redis | undefined;

  constructor(options: RealtimeEmitterOptions = {}) {
    this.io = options.io;
    this.redisPublisher = options.redisPublisher;
  }

  public setSocketServer(io: SocketIOServer): void {
    this.io = io;
  }

  public setRedisPublisher(redis: Redis): void {
    this.redisPublisher = redis;
  }

  public async emitCompilationQueued(event: CompilationQueuedEvent): Promise<void> {
    const room = `project:${event.projectId}`;
    const eventName = 'compilation.queued';

    if (this.io) {
      this.io.to(room).emit(eventName, event);
    }

    if (this.redisPublisher) {
      try {
        await this.redisPublisher.publish(
          'realtime:events',
          JSON.stringify({ room, eventName, payload: event }),
        );
      } catch (err) {
        logger.warn({ err, event }, 'Failed to publish realtime event to Redis');
      }
    }
  }

  public async emitCompilationStarted(event: CompilationStartedEvent): Promise<void> {
    const room = `project:${event.projectId}`;
    const eventName = 'compilation.started';

    if (this.io) {
      this.io.to(room).emit(eventName, event);
    }

    if (this.redisPublisher) {
      try {
        await this.redisPublisher.publish(
          'realtime:events',
          JSON.stringify({ room, eventName, payload: event }),
        );
      } catch (err) {
        logger.warn({ err, event }, 'Failed to publish realtime event to Redis');
      }
    }
  }

  public async emitCompilationFinished(event: CompilationFinishedEvent): Promise<void> {
    const room = `project:${event.projectId}`;
    const eventName = 'compilation.finished';

    if (this.io) {
      this.io.to(room).emit(eventName, event);
    }

    if (this.redisPublisher) {
      try {
        await this.redisPublisher.publish(
          'realtime:events',
          JSON.stringify({ room, eventName, payload: event }),
        );
      } catch (err) {
        logger.warn({ err, event }, 'Failed to publish realtime event to Redis');
      }
    }
  }
}
