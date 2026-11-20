import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { PrismaClient } from '@texly/db';
import {
  ProjectJoinEventSchema,
  ProjectLeaveEventSchema,
  DocumentJoinEventSchema,
  DocumentLeaveEventSchema,
  ProjectSyncRequestSchema,
  type ProjectSyncResponse,
} from '@texly/shared';
import { logger } from '../logging/logger.js';
import type { JwtService } from '../modules/auth/jwt.service.js';
import type { RealtimeEmitter } from './realtime-emitter.js';
import type { DocumentsRepository } from '../modules/documents/documents.repository.js';

export interface SetupSocketOptions {
  httpServer: HttpServer;
  jwtService: JwtService;
  realtimeEmitter: RealtimeEmitter;
  documentsRepository?: DocumentsRepository | undefined;
  prisma?: PrismaClient | undefined;
  redisUrl?: string | undefined;
  redisPub?: Redis | undefined;
  redisSub?: Redis | undefined;
  corsAllowedOrigins?: string[] | undefined;
}

export function setupSocketServer(options: SetupSocketOptions): SocketIOServer {
  const io = new SocketIOServer(options.httpServer, {
    path: '/socket.io',
    cors: {
      origin: options.corsAllowedOrigins ?? ['http://localhost:3000'],
      credentials: true,
    },
  });

  // Configure Redis adapter for multi-instance scaling and reliability
  if (options.redisPub && options.redisSub) {
    io.adapter(createAdapter(options.redisPub, options.redisSub));
  } else if (options.redisUrl) {
    try {
      const pubClient = new Redis(options.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      const subClient = pubClient.duplicate();
      pubClient.on('error', (err) => logger.warn({ err }, 'Socket.IO Redis pubClient error'));
      subClient.on('error', (err) => logger.warn({ err }, 'Socket.IO Redis subClient error'));
      io.adapter(createAdapter(pubClient, subClient));
    } catch (err) {
      logger.warn(
        { err },
        'Failed to initialize Socket.IO Redis adapter, continuing with in-memory adapter',
      );
    }
  }

  // Authentication handshake middleware
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers.authorization;
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      const authToken = socket.handshake.auth?.['token'] as string | undefined;

      let cookieToken: string | undefined;
      if (socket.handshake.headers.cookie) {
        const match = socket.handshake.headers.cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
        if (match) cookieToken = decodeURIComponent(match[1]!);
      }

      const token = authToken || bearerToken || cookieToken;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = await options.jwtService.verifyAccessToken(token);
      socket.data['user'] = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
      next();
    } catch {
      next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data['user']?.id as string | undefined;
    logger.debug({ socketId: socket.id, userId }, 'Socket client connected');

    // 1. Join Project Room (with RBAC authorization)
    socket.on('project.join', async (data: unknown, callback?: (res: unknown) => void) => {
      try {
        const parsed = ProjectJoinEventSchema.safeParse(data);
        if (!parsed.success) {
          socket.emit('error', {
            code: 'VALIDATION_FAILED',
            message: 'Invalid project join payload',
          });
          callback?.({ ok: false, error: 'Invalid payload' });
          return;
        }

        const { projectId } = parsed.data;
        if (!userId) {
          socket.emit('error', { code: 'UNAUTHENTICATED', message: 'User not authenticated' });
          callback?.({ ok: false, error: 'Unauthenticated' });
          return;
        }

        if (options.documentsRepository) {
          const access = await options.documentsRepository.getProjectAccess(projectId, userId);
          if (!access.hasAccess) {
            socket.emit('error', {
              code: 'FORBIDDEN',
              message: 'Not authorized for this project',
            });
            callback?.({ ok: false, error: 'Unauthorized' });
            return;
          }
        }

        const room = `project:${projectId}`;
        await socket.join(room);
        logger.debug({ socketId: socket.id, userId, room }, 'Socket joined project room');
        callback?.({ ok: true, projectId });
      } catch (err) {
        logger.error({ err, socketId: socket.id }, 'Error joining project room');
        callback?.({ ok: false, error: 'Internal error' });
      }
    });

    // 2. Leave Project Room
    socket.on('project.leave', (data: unknown, callback?: (res: unknown) => void) => {
      const parsed = ProjectLeaveEventSchema.safeParse(data);
      if (!parsed.success) {
        callback?.({ ok: false, error: 'Invalid payload' });
        return;
      }
      const room = `project:${parsed.data.projectId}`;
      void socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Socket left project room');
      callback?.({ ok: true });
    });

    // 3. Join Document Room (with RBAC & Project Ownership authorization)
    socket.on('document.join', async (data: unknown, callback?: (res: unknown) => void) => {
      try {
        const parsed = DocumentJoinEventSchema.safeParse(data);
        if (!parsed.success) {
          socket.emit('error', {
            code: 'VALIDATION_FAILED',
            message: 'Invalid document join payload',
          });
          callback?.({ ok: false, error: 'Invalid payload' });
          return;
        }

        const { projectId, documentId } = parsed.data;
        if (!userId) {
          socket.emit('error', { code: 'UNAUTHENTICATED', message: 'User not authenticated' });
          callback?.({ ok: false, error: 'Unauthenticated' });
          return;
        }

        if (options.documentsRepository) {
          const access = await options.documentsRepository.getProjectAccess(projectId, userId);
          if (!access.hasAccess) {
            socket.emit('error', {
              code: 'FORBIDDEN',
              message: 'Not authorized for this project',
            });
            callback?.({ ok: false, error: 'Unauthorized' });
            return;
          }

          const doc = await options.documentsRepository.findDocument(projectId, documentId);
          if (!doc) {
            socket.emit('error', { code: 'NOT_FOUND', message: 'Document not found in project' });
            callback?.({ ok: false, error: 'Document not found' });
            return;
          }
        }

        const room = `document:${documentId}`;
        await socket.join(room);
        logger.debug({ socketId: socket.id, userId, room }, 'Socket joined document room');
        callback?.({ ok: true, documentId });
      } catch (err) {
        logger.error({ err, socketId: socket.id }, 'Error joining document room');
        callback?.({ ok: false, error: 'Internal error' });
      }
    });

    // 4. Leave Document Room
    socket.on('document.leave', (data: unknown, callback?: (res: unknown) => void) => {
      const parsed = DocumentLeaveEventSchema.safeParse(data);
      if (!parsed.success) {
        callback?.({ ok: false, error: 'Invalid payload' });
        return;
      }
      const room = `document:${parsed.data.documentId}`;
      void socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Socket left document room');
      callback?.({ ok: true });
    });

    // 5. Project Synchronization Request
    socket.on('project.sync', async (data: unknown, callback?: (res: unknown) => void) => {
      try {
        const parsed = ProjectSyncRequestSchema.safeParse(data);
        if (!parsed.success) {
          socket.emit('error', {
            code: 'VALIDATION_FAILED',
            message: 'Invalid project sync request payload',
          });
          callback?.({ ok: false, error: 'Invalid payload' });
          return;
        }

        const { projectId } = parsed.data;
        if (!userId) {
          socket.emit('error', { code: 'UNAUTHENTICATED', message: 'User not authenticated' });
          callback?.({ ok: false, error: 'Unauthenticated' });
          return;
        }

        if (options.documentsRepository && options.prisma) {
          const access = await options.documentsRepository.getProjectAccess(projectId, userId);
          if (!access.hasAccess) {
            socket.emit('error', {
              code: 'FORBIDDEN',
              message: 'Not authorized for this project',
            });
            callback?.({ ok: false, error: 'Unauthorized' });
            return;
          }

          const [project, files, documents, activeComp] = await Promise.all([
            options.prisma.project.findUnique({
              where: { id: projectId },
              select: { mainFileId: true },
            }),
            options.prisma.projectFile.findMany({
              where: { projectId, deletedAt: null },
              select: {
                id: true,
                parentId: true,
                name: true,
                path: true,
                nodeType: true,
                updatedAt: true,
                document: { select: { id: true } },
              },
            }),
            options.prisma.document.findMany({
              where: { projectId },
              select: {
                id: true,
                fileId: true,
                revision: true,
                contentHash: true,
                updatedAt: true,
              },
            }),
            options.prisma.compilation.findFirst({
              where: {
                projectId,
                status: { in: ['QUEUED', 'RUNNING'] },
              },
              orderBy: { queuedAt: 'desc' },
              select: { id: true, status: true },
            }),
          ]);

          const syncResponse: ProjectSyncResponse = {
            projectId,
            mainFileId: project?.mainFileId ?? null,
            activeCompilation: activeComp
              ? { compilationId: activeComp.id, status: activeComp.status }
              : null,
            files: files.map((f) => ({
              id: f.id,
              parentId: f.parentId,
              name: f.name,
              path: f.path,
              nodeType: f.nodeType,
              updatedAt: f.updatedAt.toISOString(),
              ...(f.document?.id ? { documentId: f.document.id } : {}),
            })),
            documents: documents.map((d) => ({
              id: d.id,
              fileId: d.fileId,
              revision: d.revision,
              contentHash: d.contentHash,
              updatedAt: d.updatedAt.toISOString(),
            })),
            timestamp: new Date().toISOString(),
          };

          callback?.({ ok: true, data: syncResponse });
          socket.emit('project.sync', syncResponse);
        }
      } catch (err) {
        logger.error({ err, socketId: socket.id }, 'Error executing project sync');
        callback?.({ ok: false, error: 'Internal error' });
      }
    });

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id, userId }, 'Socket client disconnected');
    });
  });

  options.realtimeEmitter.setSocketServer(io);

  return io;
}
