import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'node:crypto';
import { getDbClient, type DatabaseInstance } from '@texly/db';
import { buildContainer, type AppContainer } from '../container.js';
import { createApiRouter } from '../http/routes.js';
import { errorHandler } from '../http/middleware/error-handler.js';
import { requestIdMiddleware } from '../http/middleware/request-id.js';

describe('Projects API & Persistence (Integration)', () => {
  let app: express.Express;
  let db: DatabaseInstance;
  let container: AppContainer;

  let ownerUserId: string;
  let outsiderUserId: string;
  let ownerToken: string;
  let outsiderToken: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    db = getDbClient();
    container = buildContainer({
      db,
      envOverrides: {
        NODE_ENV: 'test',
        COOKIE_SECURE: false,
      },
    });

    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use('/api/v1', createApiRouter(container));
    app.use(errorHandler);

    const createTestUser = async (email: string, name: string) => {
      const user = await db.client.user.create({
        data: {
          email,
          name,
          passwordHash: 'dummy-hash',
          emailVerifiedAt: new Date(),
        },
      });
      const session = await db.client.session.create({
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

    const ownerRes = await createTestUser('project-owner@texly.app', 'Project Owner');
    const outsiderRes = await createTestUser('project-outsider@texly.app', 'Project Outsider');

    ownerUserId = ownerRes.user.id;
    outsiderUserId = outsiderRes.user.id;
    ownerToken = ownerRes.token;
    outsiderToken = outsiderRes.token;

    // Create Owner Workspace
    const workspace = await db.client.workspace.create({
      data: {
        name: 'Project Test Workspace',
        slug: `ws-${crypto.randomUUID().slice(0, 8)}`,
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

    // Create Outsider Workspace
    const otherWs = await db.client.workspace.create({
      data: {
        name: 'Outsider Workspace',
        slug: `ws-${crypto.randomUUID().slice(0, 8)}`,
        isPersonal: true,
        members: {
          create: [{ userId: outsiderUserId, role: 'OWNER' }],
        },
      },
    });
    otherWorkspaceId = otherWs.id;
  });

  afterAll(async () => {
    // Clean up created resources
    await db.client.project.deleteMany({
      where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
    });
    await db.client.workspace.deleteMany({
      where: { id: { in: [workspaceId, otherWorkspaceId] } },
    });
    await db.client.user.deleteMany({
      where: { id: { in: [ownerUserId, outsiderUserId] } },
    });
  });

  describe('POST /api/v1/projects', () => {
    it('creates a new blank project with initial main.tex document and OWNER role', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          name: 'My New LaTeX Paper',
          description: 'A test paper description',
          template: 'blank',
          engine: 'PDFLATEX',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        workspaceId,
        name: 'My New LaTeX Paper',
        description: 'A test paper description',
        engine: 'PDFLATEX',
        role: 'OWNER',
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.mainFileId).toBeDefined();

      const projectId = res.body.data.id;

      // Verify files in DB
      const files = await db.client.projectFile.findMany({
        where: { projectId },
        include: { document: true },
      });
      expect(files).toHaveLength(1);
      expect(files[0]!.name).toBe('main.tex');
      expect(files[0]!.document).not.toBeNull();
      expect(files[0]!.document!.revision).toBe(1);
      expect(files[0]!.document!.content).toContain('\\documentclass{article}');
    });

    it('creates an article project with both main.tex and references.bib', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          name: 'Academic Research Article',
          template: 'article',
          engine: 'XELATEX',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.engine).toBe('XELATEX');

      const projectId = res.body.data.id;

      // Verify both files created
      const files = await db.client.projectFile.findMany({
        where: { projectId },
        orderBy: { name: 'asc' },
      });
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.name)).toEqual(['main.tex', 'references.bib']);
    });

    it('rejects creation when user is not a member of the workspace (403)', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({
          workspaceId, // owner's workspace
          name: 'Hacked Project',
          template: 'blank',
        });

      expect(res.status).toBe(403);
    });

    it('rejects invalid project names (422)', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          workspaceId,
          name: '', // Empty name
        });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/projects', () => {
    it('lists user projects scoped to workspace', async () => {
      const res = await request(app)
        .get(`/api/v1/projects?workspaceId=${workspaceId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      for (const p of res.body.data) {
        expect(p.workspaceId).toBe(workspaceId);
        expect(p.role).toBe('OWNER');
      }
    });

    it('does not return projects belonging to other users', async () => {
      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Outsider should have 0 projects
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/v1/projects/:projectId', () => {
    it('returns project details for project member', async () => {
      // First list to get a project ID
      const listRes = await request(app)
        .get(`/api/v1/projects?workspaceId=${workspaceId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const projectId = listRes.body.data[0].id;

      const res = await request(app)
        .get(`/api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(projectId);
      expect(res.body.data.role).toBe('OWNER');
    });

    it('returns 404 for outsider to prevent information leakage', async () => {
      const listRes = await request(app)
        .get(`/api/v1/projects?workspaceId=${workspaceId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const projectId = listRes.body.data[0].id;

      const res = await request(app)
        .get(`/api/v1/projects/${projectId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/workspaces', () => {
    it('returns user workspaces with storage usage', async () => {
      const res = await request(app)
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const ws = res.body.data.find((w: { id: string }) => w.id === workspaceId);
      expect(ws).toBeDefined();
      expect(ws.name).toBe('Project Test Workspace');
      expect(ws.role).toBe('OWNER');
      expect(ws.usage).toBeDefined();
      expect(typeof ws.usage.storageBytes).toBe('number');
    });
  });
});

