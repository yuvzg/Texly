import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import crypto from 'node:crypto';
import { setupTestDatabase, type TestDatabase } from './test-db.js';
import { createApp } from '../http/app.js';
import { buildContainer, type AppContainer } from '../container.js';
import { MockEmailSender } from '../modules/email/email.service.js';
import { MemoryRateLimitStore } from '../http/middleware/rate-limiter.js';
import { MemoryStorageService } from '../infrastructure/storage/memory-storage.service.js';
import { ErrorCodeEnum } from '@texly/shared';

describe('Documents API & Persistence (Integration)', () => {
  let db: TestDatabase;
  let container: AppContainer;
  let app: Express;

  let ownerUserId: string;
  let editorUserId: string;
  let viewerUserId: string;
  let outsiderUserId: string;

  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let outsiderToken: string;

  let workspaceId: string;
  let projectId: string;
  let mainFileId: string;
  let mainDocId: string;

  beforeAll(async () => {
    db = await setupTestDatabase();
    const storage = new MemoryStorageService('test-projects-bucket');

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

    const ownerRes = await createTestUser('doc-owner@texly.app', 'Doc Owner');
    const editorRes = await createTestUser('doc-editor@texly.app', 'Doc Editor');
    const viewerRes = await createTestUser('doc-viewer@texly.app', 'Doc Viewer');
    const outsiderRes = await createTestUser('doc-outsider@texly.app', 'Doc Outsider');

    ownerUserId = ownerRes.user.id;
    editorUserId = editorRes.user.id;
    viewerUserId = viewerRes.user.id;
    outsiderUserId = outsiderRes.user.id;

    ownerToken = ownerRes.token;
    editorToken = editorRes.token;
    viewerToken = viewerRes.token;
    outsiderToken = outsiderRes.token;

    // Create Workspace & Subscription
    const workspace = await db.db.client.workspace.create({
      data: {
        name: 'Doc Workspace',
        slug: 'doc-workspace',
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

    // Create Project
    const project = await db.db.client.project.create({
      data: {
        workspaceId,
        name: 'Document Save Test Project',
        engine: 'PDFLATEX',
        bibTool: 'AUTO',
        createdById: ownerUserId,
        members: {
          create: [
            { userId: ownerUserId, role: 'OWNER' },
            { userId: editorUserId, role: 'EDITOR' },
            { userId: viewerUserId, role: 'VIEWER' },
          ],
        },
      },
    });
    projectId = project.id;

    // Create main.tex file and document
    const initialContent =
      '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}';
    const initialHash = crypto.createHash('sha256').update(initialContent, 'utf8').digest('hex');

    const mainFile = await db.db.client.projectFile.create({
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
    mainFileId = mainFile.id;

    const mainDoc = await db.db.client.document.create({
      data: {
        fileId: mainFileId,
        projectId,
        content: initialContent,
        contentHash: initialHash,
        revision: 1,
        sizeBytes: Buffer.byteLength(initialContent, 'utf8'),
        updatedById: ownerUserId,
      },
    });
    mainDocId = mainDoc.id;

    await db.db.client.project.update({
      where: { id: projectId },
      data: { mainFileId },
    });
  }, 180000);

  afterAll(async () => {
    if (db) {
      await db.cleanup();
    }
  });

  describe('GET /api/v1/projects/:projectId/documents/main', () => {
    it('returns the main document for project members', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/documents/main`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mainDocId);
      expect(res.body.data.path).toBe('main.tex');
      expect(res.body.data.revision).toBe(1);
      expect(res.body.data.content).toContain('Hello World');
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get(`/api/v1/projects/${projectId}/documents/main`);
      expect(res.status).toBe(401);
    });

    it('rejects outsider with 404 (preventing project enumeration)', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/documents/main`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/projects/:projectId/documents/:documentId/content', () => {
    it('successfully saves document content, updates hash and increments revision', async () => {
      const updatedContent =
        '\\documentclass{article}\n\\begin{document}\nUpdated Content 1\n\\end{document}';

      const res = await request(app)
        .put(`/api/v1/projects/${projectId}/documents/${mainDocId}/content`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          baseRevision: 1,
          content: updatedContent,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.revision).toBe(2);
      expect(res.body.data.unchanged).toBe(false);
      expect(res.body.data.contentHash).toBeDefined();

      // Verify PostgreSQL database was actually updated
      const persisted = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });

      expect(persisted).not.toBeNull();
      expect(persisted?.content).toBe(updatedContent);
      expect(persisted?.revision).toBe(2);
      expect(persisted?.updatedById).toBe(editorUserId);

      // Verify document_versions snapshot was created
      const versions = await db.db.client.documentVersion.findMany({
        where: { documentId: mainDocId },
      });
      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions[0]?.source).toBe('CHECKPOINT');
      expect(versions[0]?.revision).toBe(2);
    });

    it('returns unchanged: true when saving identical content (no-op save)', async () => {
      const currentDoc = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });

      const res = await request(app)
        .put(`/api/v1/projects/${projectId}/documents/${mainDocId}/content`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          baseRevision: currentDoc!.revision,
          content: currentDoc!.content,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.revision).toBe(currentDoc!.revision);
      expect(res.body.data.unchanged).toBe(true);
    });

    it('detects revision conflict (409) when baseRevision is stale', async () => {
      const staleContent =
        '\\documentclass{article}\n\\begin{document}\nStale edit\n\\end{document}';

      // Pass baseRevision: 1 when server is already at revision 2
      const res = await request(app)
        .put(`/api/v1/projects/${projectId}/documents/${mainDocId}/content`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          baseRevision: 1,
          content: staleContent,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCodeEnum.REVISION_CONFLICT);
      expect(res.body.error.details.serverRevision).toBe(2);

      // Verify stale content was NOT persisted
      const current = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });
      expect(current?.content).not.toBe(staleContent);
    });

    it('validates clientHash and rejects with 422 if hash does not match', async () => {
      const currentDoc = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });

      const res = await request(app)
        .put(`/api/v1/projects/${projectId}/documents/${mainDocId}/content`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          baseRevision: currentDoc!.revision,
          content: '\\documentclass{article}\n\\begin{document}\nValid content\n\\end{document}',
          clientHash: '0000000000000000000000000000000000000000000000000000000000000000',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCodeEnum.HASH_MISMATCH);
    });

    it('rejects VIEWER role with 403 FORBIDDEN', async () => {
      const currentDoc = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });

      const res = await request(app)
        .put(`/api/v1/projects/${projectId}/documents/${mainDocId}/content`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          baseRevision: currentDoc!.revision,
          content: 'Hacked content',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCodeEnum.FORBIDDEN);
    });

    it('enforces atomic concurrency: two concurrent updates with the same base revision produce exactly one winner and one 409', async () => {
      const currentDoc = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });
      const baseRevision = currentDoc!.revision;

      const contentA = `\\documentclass{article}\n\\begin{document}\nConcurrent Writer A at rev ${baseRevision}\n\\end{document}`;
      const contentB = `\\documentclass{article}\n\\begin{document}\nConcurrent Writer B at rev ${baseRevision}\n\\end{document}`;

      // Execute both requests concurrently in parallel
      const [resA, resB] = await Promise.all([
        request(app)
          .put(`/api/v1/projects/${projectId}/documents/${mainDocId}/content`)
          .set('Authorization', `Bearer ${editorToken}`)
          .send({
            baseRevision,
            content: contentA,
          }),
        request(app)
          .put(`/api/v1/projects/${projectId}/documents/${mainDocId}/content`)
          .set('Authorization', `Bearer ${editorToken}`)
          .send({
            baseRevision,
            content: contentB,
          }),
      ]);

      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);

      const winningRes = resA.status === 200 ? resA : resB;
      const conflictingRes = resA.status === 409 ? resA : resB;

      expect(winningRes.body.data.revision).toBe(baseRevision + 1);
      expect(conflictingRes.body.error.code).toBe(ErrorCodeEnum.REVISION_CONFLICT);
      expect(conflictingRes.body.error.details.serverRevision).toBe(baseRevision + 1);

      // Verify PostgreSQL state: revision incremented by exactly 1
      const persisted = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });
      expect(persisted?.revision).toBe(baseRevision + 1);

      // Content matches winning payload exactly
      const winningContent = resA.status === 200 ? contentA : contentB;
      expect(persisted?.content).toBe(winningContent);
    });

    it('supports direct endpoint PUT /api/v1/documents/:documentId/content', async () => {
      const currentDoc = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });
      const baseRevision = currentDoc!.revision;
      const updatedContent = '\\documentclass{article}\n\\begin{document}\nDirect endpoint update\n\\end{document}';

      const res = await request(app)
        .put(`/api/v1/documents/${mainDocId}/content`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          baseRevision,
          content: updatedContent,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.revision).toBe(baseRevision + 1);

      const persisted = await db.db.client.document.findUnique({
        where: { id: mainDocId },
      });
      expect(persisted?.content).toBe(updatedContent);
      expect(persisted?.revision).toBe(baseRevision + 1);
    });

    it('rejects cross-project document access with 404', async () => {
      // Create a second project
      const otherProject = await db.db.client.project.create({
        data: {
          workspaceId,
          name: 'Other Project',
          engine: 'PDFLATEX',
          bibTool: 'AUTO',
          createdById: ownerUserId,
          members: {
            create: [{ userId: editorUserId, role: 'EDITOR' }],
          },
        },
      });

      // Try accessing mainDocId from project 1 under otherProject.id
      const res = await request(app)
        .put(`/api/v1/projects/${otherProject.id}/documents/${mainDocId}/content`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          baseRevision: 1,
          content: 'Cross project injection',
        });

      expect(res.status).toBe(404);
    });
  });
});
