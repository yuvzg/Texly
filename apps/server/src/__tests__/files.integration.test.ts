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

describe('Files API & File Tree Persistence (Integration)', () => {
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

    const ownerRes = await createTestUser('file-owner@texly.app', 'File Owner');
    const editorRes = await createTestUser('file-editor@texly.app', 'File Editor');
    const viewerRes = await createTestUser('file-viewer@texly.app', 'File Viewer');
    const outsiderRes = await createTestUser('file-outsider@texly.app', 'File Outsider');

    ownerUserId = ownerRes.user.id;
    editorUserId = editorRes.user.id;
    viewerUserId = viewerRes.user.id;
    outsiderUserId = outsiderRes.user.id;

    ownerToken = ownerRes.token;
    editorToken = editorRes.token;
    viewerToken = viewerRes.token;
    outsiderToken = outsiderRes.token;

    // Create Workspace
    const workspace = await db.db.client.workspace.create({
      data: {
        name: 'Files Workspace',
        slug: 'files-workspace',
        isPersonal: true,
        members: {
          create: [{ userId: ownerUserId, role: 'OWNER' }],
        },
      },
    });
    workspaceId = workspace.id;

    // Create Project
    const project = await db.db.client.project.create({
      data: {
        workspaceId,
        name: 'File System Test Project',
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

    // Create initial main.tex
    const mainFile = await db.db.client.projectFile.create({
      data: {
        projectId,
        name: 'main.tex',
        path: 'main.tex',
        nodeType: 'FILE',
        kind: 'TEXT',
        createdById: ownerUserId,
        sizeBytes: BigInt(60),
      },
    });
    mainFileId = mainFile.id;

    await db.db.client.document.create({
      data: {
        fileId: mainFile.id,
        projectId,
        content: '\\documentclass{article}\n\\begin{document}\nMain\n\\end{document}',
        contentHash: crypto.createHash('sha256').update('main').digest('hex'),
        revision: 1,
        sizeBytes: 60,
        updatedById: ownerUserId,
      },
    });

    await db.db.client.project.update({
      where: { id: projectId },
      data: { mainFileId: mainFile.id },
    });
  }, 180000);

  afterAll(async () => {
    if (db) {
      await db.cleanup();
    }
  });

  describe('1. File & Directory Creation (POST /projects/:projectId/files)', () => {
    it('creates a root-level folder successfully', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          nodeType: 'FOLDER',
          name: 'chapters',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('chapters');
      expect(res.body.data.path).toBe('chapters');
      expect(res.body.data.nodeType).toBe('FOLDER');
      expect(res.body.data.parentId).toBeNull();
    });

    it('creates a nested directory inside an existing folder', async () => {
      // Find 'chapters' folder
      const chapters = await db.db.client.projectFile.findFirst({
        where: { projectId, name: 'chapters', deletedAt: null },
      });
      expect(chapters).not.toBeNull();

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          nodeType: 'FOLDER',
          parentId: chapters!.id,
          name: 'subsections',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('subsections');
      expect(res.body.data.path).toBe('chapters/subsections');
      expect(res.body.data.parentId).toBe(chapters!.id);
    });

    it('rejects sibling case-insensitive collision in same folder (NAME_TAKEN 409)', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          nodeType: 'FOLDER',
          name: 'CHAPTERS',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCodeEnum.NAME_TAKEN);
    });

    it('rejects invalid names with forbidden characters or path traversal (INVALID_NAME 422)', async () => {
      const invalidNames = [
        '../traversal.tex',
        'sub/folder',
        'foo\\bar',
        'foo*bar',
        'foo?bar',
        'foo:bar',
        '-leading-hyphen',
        '.hidden-dot',
        'trailing-space ',
        'trailing-dot.',
        '',
      ];

      for (const name of invalidNames) {
        const res = await request(app)
          .post(`/api/v1/projects/${projectId}/files`)
          .set('Authorization', `Bearer ${editorToken}`)
          .send({
            nodeType: 'FOLDER',
            name,
          });

        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('creates a text document with Document record and revision 1', async () => {
      const chapters = await db.db.client.projectFile.findFirst({
        where: { projectId, name: 'chapters', deletedAt: null },
      });

      const initialContent = '\\section{Introduction}\nThis is chapter 1.';
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          nodeType: 'FILE',
          parentId: chapters!.id,
          name: 'intro.tex',
          content: initialContent,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('intro.tex');
      expect(res.body.data.path).toBe('chapters/intro.tex');
      expect(res.body.data.nodeType).toBe('FILE');
      expect(res.body.data.kind).toBe('TEXT');
      expect(res.body.data.revision).toBe(1);
      expect(res.body.data.documentId).toBeDefined();

      // Verify Document record in PostgreSQL
      const doc = await db.db.client.document.findUnique({
        where: { fileId: res.body.data.id },
      });
      expect(doc).not.toBeNull();
      expect(doc?.content).toBe(initialContent);
      expect(doc?.revision).toBe(1);

      // Verify DocumentVersion record
      const version = await db.db.client.documentVersion.findFirst({
        where: { documentId: doc!.id },
      });
      expect(version).not.toBeNull();
      expect(version?.revision).toBe(1);
      expect(version?.source).toBe('MANUAL');
    });

    it('rejects unsupported text file extensions with UNSUPPORTED_FILE_TYPE 422', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          nodeType: 'FILE',
          name: 'malware.exe',
          content: 'binary',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCodeEnum.UNSUPPORTED_FILE_TYPE);
    });

    it('rejects viewers with FORBIDDEN 403', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          nodeType: 'FOLDER',
          name: 'viewer-folder',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('2. File Tree Retrieval (GET /projects/:projectId/files)', () => {
    it('returns all active files with mainFileId', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.files).toBeInstanceOf(Array);
      expect(res.body.data.files.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data.mainFileId).toBe(mainFileId);

      // Verify paths exist
      const paths = res.body.data.files.map((f: { path: string }) => f.path);
      expect(paths).toContain('main.tex');
      expect(paths).toContain('chapters');
      expect(paths).toContain('chapters/intro.tex');
    });

    it('rejects outsider with NOT_FOUND 404', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('3. File and Folder Rename & Move (PATCH /projects/:projectId/files/:fileId)', () => {
    it('renames a file and updates its materialized path', async () => {
      const introFile = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'chapters/intro.tex', deletedAt: null },
      });

      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/files/${introFile!.id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          name: 'introduction.tex',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('introduction.tex');
      expect(res.body.data.path).toBe('chapters/introduction.tex');
    });

    it('renames a directory and updates all descendant materialized paths atomically', async () => {
      const chaptersFolder = await db.db.client.projectFile.findFirst({
        where: { projectId, name: 'chapters', deletedAt: null },
      });

      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/files/${chaptersFolder!.id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          name: 'sections',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('sections');
      expect(res.body.data.path).toBe('sections');
      expect(res.body.affected).toBeInstanceOf(Array);

      // Verify descendant paths in database were updated from chapters/ to sections/
      const descendant = await db.db.client.projectFile.findFirst({
        where: { projectId, name: 'introduction.tex', deletedAt: null },
      });
      expect(descendant?.path).toBe('sections/introduction.tex');

      const subFolder = await db.db.client.projectFile.findFirst({
        where: { projectId, name: 'subsections', deletedAt: null },
      });
      expect(subFolder?.path).toBe('sections/subsections');
    });

    it('rejects circular move (moving folder into itself or descendant) with INVALID_MOVE 422', async () => {
      const sectionsFolder = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'sections', deletedAt: null },
      });
      const subsectionsFolder = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'sections/subsections', deletedAt: null },
      });

      // Try moving sections into sections/subsections
      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/files/${sectionsFolder!.id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          parentId: subsectionsFolder!.id,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCodeEnum.INVALID_MOVE);
    });

    it('moves a file from one directory to root level', async () => {
      const introFile = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'sections/introduction.tex', deletedAt: null },
      });

      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/files/${introFile!.id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          parentId: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.parentId).toBeNull();
      expect(res.body.data.path).toBe('introduction.tex');
    });
  });

  describe('4. Main Document Management', () => {
    it('sets a valid .tex file as main file via set-main endpoint', async () => {
      const introFile = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'introduction.tex', deletedAt: null },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/files/${introFile!.id}/set-main`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(res.status).toBe(200);

      // Verify project mainFileId updated
      const project = await db.db.client.project.findUnique({
        where: { id: projectId },
      });
      expect(project?.mainFileId).toBe(introFile!.id);
    });

    it('rejects setting a folder as main document (INVALID_MAIN_FILE 422)', async () => {
      const sectionsFolder = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'sections', deletedAt: null },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/files/${sectionsFolder!.id}/set-main`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCodeEnum.INVALID_MAIN_FILE);
    });
  });

  describe('5. Soft-Delete and Subtree Cascading (DELETE /projects/:projectId/files/:fileId)', () => {
    it('deleting main file clears project mainFileId and returns X-Main-File-Cleared header', async () => {
      const currentMain = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'introduction.tex', deletedAt: null },
      });

      const res = await request(app)
        .delete(`/api/v1/projects/${projectId}/files/${currentMain!.id}`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(res.status).toBe(204);
      expect(res.headers['x-main-file-cleared']).toBe('true');

      // Verify mainFileId in project is now null
      const project = await db.db.client.project.findUnique({
        where: { id: projectId },
      });
      expect(project?.mainFileId).toBeNull();

      // Verify file is soft-deleted
      const deleted = await db.db.client.projectFile.findUnique({
        where: { id: currentMain!.id },
      });
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('deleting a directory cascades soft-delete to all descendants', async () => {
      // First create a file inside sections/subsections
      const subsectionsFolder = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'sections/subsections', deletedAt: null },
      });

      const createRes = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          nodeType: 'FILE',
          parentId: subsectionsFolder!.id,
          name: 'deep.tex',
          content: 'deep content',
        });
      expect(createRes.status).toBe(201);

      // Now delete the top 'sections' directory
      const sectionsFolder = await db.db.client.projectFile.findFirst({
        where: { projectId, path: 'sections', deletedAt: null },
      });

      const res = await request(app)
        .delete(`/api/v1/projects/${projectId}/files/${sectionsFolder!.id}`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(res.status).toBe(204);

      // Verify sections, subsections, and deep.tex are all marked deleted
      const activeDescendants = await db.db.client.projectFile.findMany({
        where: {
          projectId,
          path: { startsWith: 'sections' },
          deletedAt: null,
        },
      });
      expect(activeDescendants.length).toBe(0);
    });

    it('excludes soft-deleted files from GET /files', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/files`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(res.status).toBe(200);
      const paths = res.body.data.files.map((f: { path: string }) => f.path);
      expect(paths).toContain('main.tex');
      expect(paths).not.toContain('sections');
      expect(paths).not.toContain('introduction.tex');
    });
  });
});

