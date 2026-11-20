import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import type { Express } from 'express';
import { setupTestDatabase, type TestDatabase } from './test-db.js';
import { createApp } from '../http/app.js';
import { buildContainer, type AppContainer } from '../container.js';
import { setupSocketServer } from '../realtime/socket-server.js';
import { MockEmailSender } from '../modules/email/email.service.js';
import { MemoryRateLimitStore } from '../http/middleware/rate-limiter.js';
import { MemoryStorageService } from '../infrastructure/storage/memory-storage.service.js';
import type {
  DocumentRevisionChangedEvent,
  FileTreeChangedEvent,
  ProjectSyncResponse,
} from '@texly/shared';

describe('Realtime Synchronization & Socket.IO (Integration)', () => {
  let db: TestDatabase;
  let container: AppContainer;
  let app: Express;
  let httpServer: http.Server;
  let serverPort: number;

  let ownerUserId: string;
  let outsiderUserId: string;

  let ownerToken: string;
  let outsiderToken: string;

  let workspaceId: string;
  let projectId: string;
  let documentId: string;
  let fileId: string;

  const openSockets: ClientSocket[] = [];

  const createClientSocket = (token?: string): ClientSocket => {
    const socket = Client(`http://localhost:${serverPort}`, {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
      ...(token ? { auth: { token } } : {}),
    });
    openSockets.push(socket);
    return socket;
  };

  beforeAll(async () => {
    db = await setupTestDatabase();
    const storage = new MemoryStorageService('realtime-test-bucket');

    container = buildContainer({
      db: db.db,
      emailSender: new MockEmailSender(),
      rateLimitStore: new MemoryRateLimitStore(),
      storageService: storage,
      envOverrides: {
        NODE_ENV: 'test',
        JWT_ACCESS_TTL_SECONDS: 900,
        REFRESH_TOKEN_TTL_DAYS: 7,
      },
    });

    app = createApp({ container });
    httpServer = http.createServer(app);

    setupSocketServer({
      httpServer,
      jwtService: container.jwtService,
      realtimeEmitter: container.realtimeEmitter,
      documentsRepository: container.documentsRepo,
      prisma: container.db.client,
      corsAllowedOrigins: ['*'],
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        serverPort = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });

    // Create users & sessions
    const createTestUser = async (email: string, name: string) => {
      const user = await db.db.client.user.create({
        data: {
          email,
          name,
          passwordHash: 'dummy-hash',
          emailVerifiedAt: new Date(),
        },
      });
      const session = await db.db.client.session.create({
        data: {
          userId: user.id,
          familyId: crypto.randomUUID(),
          tokenHash: crypto.randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      });
      const token = await container.jwtService.signAccessToken({
        sub: user.id,
        sid: session.id,
        email: user.email,
        name: user.name,
      });
      return { user, token };
    };

    const owner = await createTestUser('socket-owner@texly.app', 'Socket Owner');
    const outsider = await createTestUser('socket-outsider@texly.app', 'Socket Outsider');

    ownerUserId = owner.user.id;
    outsiderUserId = outsider.user.id;
    ownerToken = owner.token;
    outsiderToken = outsider.token;

    // Create Workspace & Project
    const workspace = await db.db.client.workspace.create({
      data: {
        name: 'Socket Workspace',
        slug: 'socket-workspace',
        isPersonal: true,
        members: {
          create: [{ userId: ownerUserId, role: 'OWNER' }],
        },
        subscription: {
          create: {
            plan: 'FREE',
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
          },
        },
      },
    });
    workspaceId = workspace.id;

    const project = await db.db.client.project.create({
      data: {
        workspaceId,
        name: 'Socket Realtime Project',
        engine: 'PDFLATEX',
        bibTool: 'AUTO',
        createdById: ownerUserId,
        members: {
          create: [{ userId: ownerUserId, role: 'OWNER' }],
        },
      },
    });
    projectId = project.id;

    // Create File and Document
    const initialContent =
      '\\documentclass{article}\n\\begin{document}\nSync Test\n\\end{document}';
    const initialHash = crypto.createHash('sha256').update(initialContent, 'utf8').digest('hex');

    const file = await db.db.client.projectFile.create({
      data: {
        projectId,
        name: 'main.tex',
        path: 'main.tex',
        nodeType: 'FILE',
        kind: 'TEXT',
        createdById: ownerUserId,
        sizeBytes: Buffer.byteLength(initialContent, 'utf8'),
      },
    });
    fileId = file.id;

    const doc = await db.db.client.document.create({
      data: {
        fileId,
        projectId,
        content: initialContent,
        contentHash: initialHash,
        revision: 1,
        sizeBytes: Buffer.byteLength(initialContent, 'utf8'),
        updatedById: ownerUserId,
      },
    });
    documentId = doc.id;

    await db.db.client.project.update({
      where: { id: projectId },
      data: { mainFileId: fileId },
    });
  }, 180000);

  afterAll(async () => {
    for (const socket of openSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (db) {
      await db.cleanup();
    }
  });

  describe('1. Handshake Authentication', () => {
    it('rejects connection without authentication token', async () => {
      const socket = createClientSocket();
      const errorPromise = new Promise<Error>((resolve) => {
        socket.on('connect_error', (err) => resolve(err));
      });

      socket.connect();
      const err = await errorPromise;
      expect(err.message).toMatch(/Authentication token required/i);
      expect(socket.connected).toBe(false);
    });

    it('rejects connection with invalid token', async () => {
      const socket = createClientSocket('invalid-jwt-token');
      const errorPromise = new Promise<Error>((resolve) => {
        socket.on('connect_error', (err) => resolve(err));
      });

      socket.connect();
      const err = await errorPromise;
      expect(err.message).toMatch(/Invalid or expired authentication token/i);
      expect(socket.connected).toBe(false);
    });

    it('successfully connects with valid JWT token', async () => {
      const socket = createClientSocket(ownerToken);
      const connectPromise = new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
      });

      socket.connect();
      await connectPromise;
      expect(socket.connected).toBe(true);
      expect(socket.id).toBeDefined();
    });
  });

  describe('2. Room Authorization', () => {
    it('rejects joining project room for unauthorized outsider', async () => {
      const outsiderSocket = createClientSocket(outsiderToken);
      await new Promise<void>((resolve) => {
        outsiderSocket.on('connect', () => resolve());
        outsiderSocket.connect();
      });

      const ackResponse = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        outsiderSocket.emit(
          'project.join',
          { projectId },
          (res: { ok: boolean; error?: string }) => {
            resolve(res);
          },
        );
      });

      expect(ackResponse.ok).toBe(false);
      expect(ackResponse.error).toMatch(/Unauthorized/i);
    });

    it('rejects joining project room with invalid payload schema', async () => {
      const ownerSocket = createClientSocket(ownerToken);
      await new Promise<void>((resolve) => {
        ownerSocket.on('connect', () => resolve());
        ownerSocket.connect();
      });

      const ackResponse = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        ownerSocket.emit(
          'project.join',
          { projectId: 'not-a-valid-uuid' },
          (res: { ok: boolean; error?: string }) => {
            resolve(res);
          },
        );
      });

      expect(ackResponse.ok).toBe(false);
      expect(ackResponse.error).toMatch(/Invalid payload/i);
    });

    it('allows authorized member to join project room', async () => {
      const ownerSocket = createClientSocket(ownerToken);
      await new Promise<void>((resolve) => {
        ownerSocket.on('connect', () => resolve());
        ownerSocket.connect();
      });

      const ackResponse = await new Promise<{ ok: boolean; projectId?: string }>((resolve) => {
        ownerSocket.emit(
          'project.join',
          { projectId },
          (res: { ok: boolean; projectId?: string }) => {
            resolve(res);
          },
        );
      });

      expect(ackResponse.ok).toBe(true);
      expect(ackResponse.projectId).toBe(projectId);
    });

    it('allows authorized member to join and leave document room', async () => {
      const ownerSocket = createClientSocket(ownerToken);
      await new Promise<void>((resolve) => {
        ownerSocket.on('connect', () => resolve());
        ownerSocket.connect();
      });

      const joinAck = await new Promise<{ ok: boolean; documentId?: string }>((resolve) => {
        ownerSocket.emit(
          'document.join',
          { projectId, documentId },
          (res: { ok: boolean; documentId?: string }) => {
            resolve(res);
          },
        );
      });
      expect(joinAck.ok).toBe(true);
      expect(joinAck.documentId).toBe(documentId);

      const leaveAck = await new Promise<{ ok: boolean }>((resolve) => {
        ownerSocket.emit('document.leave', { projectId, documentId }, (res: { ok: boolean }) => {
          resolve(res);
        });
      });
      expect(leaveAck.ok).toBe(true);
    });
  });

  describe('3. Realtime Notification Events', () => {
    it('emits document.revision.changed to project and document room subscribers upon REST PUT', async () => {
      const client = createClientSocket(ownerToken);
      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
        client.connect();
      });

      // Join the project room
      await new Promise<{ ok: boolean }>((resolve) => {
        client.emit('project.join', { projectId }, resolve);
      });

      // Prepare promise listening for the event
      const eventPromise = new Promise<DocumentRevisionChangedEvent>((resolve) => {
        client.on('document.revision.changed', (evt: DocumentRevisionChangedEvent) => {
          resolve(evt);
        });
      });

      // Perform REST update
      const newContent =
        '\\documentclass{article}\n\\begin{document}\nRealtime Event Triggered\n\\end{document}';
      const putRes = await request(app)
        .put(`/api/v1/projects/${projectId}/documents/${documentId}/content`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          baseRevision: 1,
          content: newContent,
        });

      expect(putRes.status).toBe(200);
      const newRev = putRes.body.data.revision;

      // Wait for socket event
      const event = await eventPromise;
      expect(event.projectId).toBe(projectId);
      expect(event.documentId).toBe(documentId);
      expect(event.revision).toBe(newRev);
      expect(event.contentHash).toBe(putRes.body.data.contentHash);
      expect(event.byUserId).toBe(ownerUserId);
      expect(event.timestamp).toBeDefined();
    });

    it('emits file.tree.changed when a file is created or deleted via REST', async () => {
      const client = createClientSocket(ownerToken);
      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
        client.connect();
      });

      await new Promise<{ ok: boolean }>((resolve) => {
        client.emit('project.join', { projectId }, resolve);
      });

      const fileEventPromise = new Promise<FileTreeChangedEvent>((resolve) => {
        client.on('file.tree.changed', (evt: FileTreeChangedEvent) => {
          resolve(evt);
        });
      });

      // Create new file via REST
      const postRes = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'chapter1.tex',
          nodeType: 'FILE',
          content: '% Chapter 1 content\n',
        });

      expect(postRes.status).toBe(201);
      const createdFileId = postRes.body.data.id;

      const event = await fileEventPromise;
      expect(event.projectId).toBe(projectId);
      expect(event.op).toBe('create');
      expect(event.fileId).toBe(createdFileId);
      expect(event.path).toBe('chapter1.tex');
    });
  });

  describe('4. Project Synchronization (project.sync)', () => {
    it('returns authoritative file tree and document revisions for reconnect recovery', async () => {
      const client = createClientSocket(ownerToken);
      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
        client.connect();
      });

      const syncResult = await new Promise<{ ok: boolean; data: ProjectSyncResponse }>(
        (resolve) => {
          client.emit(
            'project.sync',
            { projectId },
            (res: { ok: boolean; data: ProjectSyncResponse }) => {
              resolve(res);
            },
          );
        },
      );

      expect(syncResult.ok).toBe(true);
      expect(syncResult.data.projectId).toBe(projectId);
      expect(syncResult.data.mainFileId).toBe(fileId);

      // Verify authoritative files list
      expect(syncResult.data.files.length).toBeGreaterThanOrEqual(1);
      const mainFileEntry = syncResult.data.files.find((f) => f.id === fileId);
      expect(mainFileEntry).toBeDefined();
      expect(mainFileEntry?.name).toBe('main.tex');
      expect(mainFileEntry?.nodeType).toBe('FILE');

      // Verify authoritative document revisions
      expect(syncResult.data.documents.length).toBeGreaterThanOrEqual(1);
      const docEntry = syncResult.data.documents.find((d) => d.id === documentId);
      expect(docEntry).toBeDefined();
      expect(docEntry?.revision).toBeGreaterThanOrEqual(2);
      expect(docEntry?.contentHash).toBeDefined();
    });
  });
});
