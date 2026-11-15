import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { Redis } from 'ioredis';
import { logger } from '../logging/logger.js';
import type { JwtService } from '../modules/auth/jwt.service.js';
import type { RealtimeEmitter } from './realtime-emitter.js';

export interface SetupSocketOptions {
  httpServer: HttpServer;
  jwtService: JwtService;
  realtimeEmitter: RealtimeEmitter;
  redisSubscriber?: Redis;
  corsAllowedOrigins?: string[];
}

export function setupSocketServer(options: SetupSocketOptions): SocketIOServer {
  const io = new SocketIOServer(options.httpServer, {
    path: '/socket.io',
    cors: {
      origin: options.corsAllowedOrigins ?? ['http://localhost:3000'],
      credentials: true,
    },
  });

  // Authentication handshake middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ??
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = await options.jwtService.verifyAccessToken(token);
      socket.data['user'] = { id: payload.sub, email: payload.email };
      next();
    } catch {
      next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data['user']?.id;
    logger.debug({ socketId: socket.id, userId }, 'Socket client connected');

    socket.on('project.join', (data: { projectId: string }) => {
      if (data?.projectId) {
        const room = `project:${data.projectId}`;
        socket.join(room);
        logger.debug({ socketId: socket.id, room }, 'Socket joined room');
      }
    });

    socket.on('project.leave', (data: { projectId: string }) => {
      if (data?.projectId) {
        const room = `project:${data.projectId}`;
        socket.leave(room);
        logger.debug({ socketId: socket.id, room }, 'Socket left room');
      }
    });

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id, userId }, 'Socket client disconnected');
    });
  });

  options.realtimeEmitter.setSocketServer(io);

  // If redisSubscriber is provided, listen to cross-node events
  if (options.redisSubscriber) {
    options.redisSubscriber.subscribe('realtime:events').catch((err) => {
      logger.error({ err }, 'Failed to subscribe to realtime:events Redis channel');
    });

    options.redisSubscriber.on('message', (channel, message) => {
      if (channel === 'realtime:events') {
        try {
          const parsed = JSON.parse(message) as {
            room: string;
            eventName: string;
            payload: unknown;
          };
          io.to(parsed.room).emit(parsed.eventName, parsed.payload);
        } catch (err) {
          logger.warn({ err }, 'Failed to parse realtime:events message');
        }
      }
    });
  }

  return io;
}
