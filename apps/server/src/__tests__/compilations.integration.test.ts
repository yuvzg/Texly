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
import { ErrorCodeEnum, type CompileJobV1, type CompileResultV1 } from '@texly/shared';
import type { Queue } from 'bullmq';
import type { CompileQueueService } from '../infrastructure/queues/compile-queue.service.js';

describe('Compilation Orchestration & APIs (Integration)', () => {
  let db: TestDatabase;
  let container: AppContainer;
  let app: Express;
  let storage: MemoryStorageService;

  let ownerUserId: string;
  let editorUserId: string;
  let viewerUserId: string;
  let _outsiderUserId: string;

  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let outsiderToken: string;

  let workspaceId: string;
  let projectId: string;
  let _mainFileId: string;
  let mainDocId: string;

  // Track enqueued compile jobs
  const enqueuedJobs: CompileJobV1[] = [];
  const removedJobIds: string[] = [];

  beforeAll(async () => {
    db = await setupTestDatabase();
    storage = new MemoryStorageService('test-projects-bucket');

    // Fake CompileQueueService to intercept BullMQ jobs
    const fakeCompileQueueService = {
      rawQueue: {} as Queue<CompileJobV1>,
      addCompileJob: async (job: CompileJobV1) => {
        enqueuedJobs.push(job);
      },
      removeJob: async (compilationId: string) => {
        removedJobIds.push(compilationId);
        return true;
      },
      getJobState: async (compilationId: string) => {
        const found = enqueuedJobs.find((j) => j.compilationId === compilationId);
        return found ? 'waiting' : null;
      },
      close: async () => {},
    } as unknown as CompileQueueService;

    container = buildContainer({
      db: db.db,
      emailSender: new MockEmailSender(),
      rateLimitStore: new MemoryRateLimitStore(),
      storageService: storage,
      compileQueueService: fakeCompileQueueService,
      envOverrides: {
        NODE_ENV: 'test',
        JWT_ACCESS_TTL_SECONDS: 3600,
        CORS_ALLOWED_ORIGINS: ['http://localhost:3000'],
      },
    });

    app = createApp({ container });

    // Seed test users
    const createTestUser = async (email: string, name: string) => {
      const user = await db.db.client.user.create({
        data: {
          email,
          name,
          passwordHash: 'argon2-dummy-hash',
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

    const ownerRes = await createTestUser('owner@texly.test', 'Owner User');
    const editorRes = await createTestUser('editor@texly.test', 'Editor User');
    const viewerRes = await createTestUser('viewer@texly.test', 'Viewer User');
    const outsiderRes = await createTestUser('outsider@texly.test', 'Outsider User');

    ownerUserId = ownerRes.user.id;
    editorUserId = editorRes.user.id;
    viewerUserId = viewerRes.user.id;
    _outsiderUserId = outsiderRes.user.id;

    ownerToken = ownerRes.token;
    editorToken = editorRes.token;
    viewerToken = viewerRes.token;
    outsiderToken = outsiderRes.token;

    // Seed workspace & active free subscription
    const workspace = await db.db.client.workspace.create({
      data: {
        name: 'Test Workspace',
        slug: `test-ws-${Date.now()}`,
        isPersonal: false,
        members: {
          create: [
            { userId: ownerUserId, role: 'OWNER' },
            { userId: editorUserId, role: 'MEMBER' },
            { userId: viewerUserId, role: 'MEMBER' },
          ],
        },
        subscription: {
          create: {
            plan: 'FREE',
            status: 'ACTIVE',
          },
        },
      },
    });
    workspaceId = workspace.id;

    // Seed project
    const project = await db.db.client.project.create({
      data: {
        workspaceId,
        createdById: ownerUserId,
        name: 'Quantum Physics Paper',
        engine: 'PDFLATEX',
        bibTool: 'AUTO',
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

    // Seed main.tex file & document
    const mainFile = await db.db.client.projectFile.create({
      data: {
        projectId,
        name: 'main.tex',
        path: 'main.tex',
        nodeType: 'FILE',
        kind: 'TEXT',
        createdById: ownerUserId,
      },
    });
    _mainFileId = mainFile.id;

    const mainContent = `\\documentclass{article}
\\begin{document}
Hello Texly Quantum World!
\\end{document}`;

    const mainDoc = await db.db.client.document.create({
      data: {
        fileId: mainFile.id,
        projectId,
        content: mainContent,
        contentHash: crypto.createHash('sha256').update(mainContent).digest('hex'),
        sizeBytes: Buffer.byteLength(mainContent, 'utf8'),
        revision: 1,
      },
    });
    mainDocId = mainDoc.id;

    // Set as mainFile on project
    await db.db.client.project.update({
      where: { id: projectId },
      data: { mainFileId: mainFile.id },
    });
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.cleanup();
    }
  });

  describe('1. Compilation Initiation & Snapshot Consistency', () => {
    it('creates a QUEUED compilation and uploads inputs.tar.gz bundle to storage', async () => {
      enqueuedJobs.length = 0;

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          trigger: 'MANUAL',
          engine: 'PDFLATEX',
          bibTool: 'AUTO',
        });

      expect(res.status).toBe(202);
      expect(res.body.data).toMatchObject({
        projectId,
        status: 'QUEUED',
        engine: 'PDFLATEX',
        bibTool: 'AUTO',
        mainFilePath: 'main.tex',
        cacheHit: false,
        hasPdf: false,
      });

      const compilationId = res.body.data.id;
      expect(compilationId).toBeDefined();

      // Verify DB record
      const dbRecord = await db.db.client.compilation.findUnique({
        where: { id: compilationId },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.status).toBe('QUEUED');
      expect(dbRecord?.docRevisions).toEqual({ 'main.tex': 1 });
      expect(dbRecord?.inputsKey).toContain(`compilations/${compilationId}/inputs.tar.gz`);

      // Verify inputs.tar.gz uploaded to storage
      const inputsBuffer = await storage.getObject(dbRecord!.inputsKey!);
      expect(inputsBuffer.length).toBeGreaterThan(0);

      // Verify job payload sent to BullMQ
      expect(enqueuedJobs).toHaveLength(1);
      const enqueued = enqueuedJobs[0]!;
      expect(enqueued.compilationId).toBe(compilationId);
      expect(enqueued.projectId).toBe(projectId);
      expect(enqueued.mainFile).toBe('main.tex');
      expect(enqueued.inputs.textBundle.url).toContain('inputs.tar.gz');
      expect(enqueued.outputs.pdf.url).toContain('output.pdf');
    });

    it('rejects compilation if user has insufficient role (VIEWER)', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ trigger: 'MANUAL' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCodeEnum.FORBIDDEN);
    });

    it('returns 404 if outsider user attempts to compile non-member project', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ trigger: 'MANUAL' });

      expect(res.status).toBe(404);
    });

    it('rejects compilation with 422 NO_MAIN_FILE if main file is missing or not a .tex file', async () => {
      // Temporarily clear mainFileId on project and request non-tex file
      const nonTexFile = await db.db.client.projectFile.create({
        data: {
          projectId,
          name: 'notes.txt',
          path: 'notes.txt',
          nodeType: 'FILE',
          createdById: ownerUserId,
          document: {
            create: {
              projectId,
              content: 'just notes',
              contentHash: 'abc',
              sizeBytes: 10,
              revision: 1,
            },
          },
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          mainFileId: nonTexFile.id,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCodeEnum.NO_MAIN_FILE);
    });

    it('rejects compilation with 422 VALIDATION_FAILED if file manifest has traversal path or collision', async () => {
      const invalidFile = await db.db.client.projectFile.create({
        data: {
          projectId,
          name: 'evil.tex',
          path: '../evil.tex',
          nodeType: 'FILE',
          createdById: ownerUserId,
          document: {
            create: {
              projectId,
              content: 'bad path',
              contentHash: 'bad',
              sizeBytes: 8,
              revision: 1,
            },
          },
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ trigger: 'MANUAL' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCodeEnum.VALIDATION_FAILED);

      // Clean up invalid file
      await db.db.client.projectFile.delete({ where: { id: invalidFile.id } });
    });
  });

  describe('2. Latest-Wins Coalescing', () => {
    it('supersedes older QUEUED compilation when a new one is requested', async () => {
      enqueuedJobs.length = 0;
      removedJobIds.length = 0;

      // 1st request
      const firstRes = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ trigger: 'MANUAL' });
      expect(firstRes.status).toBe(202);
      const firstId = firstRes.body.data.id;

      // 2nd request immediately while 1st is QUEUED
      const secondRes = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ trigger: 'MANUAL' });
      expect(secondRes.status).toBe(202);
      const secondId = secondRes.body.data.id;

      // Check that first compilation is now SUPERSEDED
      const firstDb = await db.db.client.compilation.findUnique({ where: { id: firstId } });
      expect(firstDb?.status).toBe('SUPERSEDED');
      expect(removedJobIds).toContain(firstId);

      // Second compilation is active QUEUED
      const secondDb = await db.db.client.compilation.findUnique({ where: { id: secondId } });
      expect(secondDb?.status).toBe('QUEUED');
    });
  });

  describe('3. Compilation Worker Result Ingestion & Artifact Verification', () => {
    it('handles "started" and "finished" results, verifies artifacts, and saves diagnostics', async () => {
      // Create a queued compilation
      const createRes = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ trigger: 'MANUAL' });
      const cid = createRes.body.data.id;

      // 1. Ingest "started"
      await container.compilationsWorker.handleStarted({
        compilationId: cid,
        projectId,
        status: 'RUNNING',
        timestamp: new Date().toISOString(),
        workerId: 'runner-node-1',
      });

      const runningRecord = await db.db.client.compilation.findUnique({ where: { id: cid } });
      expect(runningRecord?.status).toBe('RUNNING');
      expect(runningRecord?.startedAt).not.toBeNull();

      // Put sample PDF into storage so HEAD verification succeeds
      const pdfKey = storage.buildKey.compilation(workspaceId, projectId, cid, 'output.pdf');
      const fakePdf = Buffer.from('%PDF-1.5 Fake compiled PDF binary bytes');
      await storage.putObject(pdfKey, fakePdf, 'application/pdf');

      const logKey = storage.buildKey.compilation(workspaceId, projectId, cid, 'compile.log');
      await storage.putObject(logKey, 'Transcript log line 1\nLine 2', 'text/plain');

      // 2. Ingest "finished" with diagnostics
      const finishedPayload: CompileResultV1 = {
        version: 1,
        compilationId: cid,
        projectId,
        status: 'SUCCEEDED',
        exitCode: 0,
        durationMs: 1450,
        errorCount: 0,
        warningCount: 1,
        pageCount: 3,
        diagnostics: [
          {
            ordinal: 0,
            level: 'warning',
            file: 'main.tex',
            line: 2,
            message: 'Underfull \\hbox (badness 10000)',
          },
        ],
        outputs: {
          pdfKey,
          logKey,
          synctexKey: 'compilations/synctex.gz',
        },
        outputSizes: {
          pdfBytes: fakePdf.length,
          logBytes: 30,
        },
      };

      await container.compilationsWorker.handleFinished(finishedPayload);

      // Verify DB record updated
      const finishedRecord = await db.db.client.compilation.findUnique({ where: { id: cid } });
      expect(finishedRecord?.status).toBe('SUCCEEDED');
      expect(finishedRecord?.pageCount).toBe(3);
      expect(finishedRecord?.durationMs).toBe(1450);
      expect(finishedRecord?.errorCount).toBe(0);
      expect(finishedRecord?.warningCount).toBe(1);
      expect(finishedRecord?.pdfKey).toBe(pdfKey);

      // Verify diagnostics saved into compilation_logs
      const logs = await db.db.client.compilationLog.findMany({
        where: { compilationId: cid },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.level).toBe('WARNING');
      expect(logs[0]!.message).toBe('Underfull \\hbox (badness 10000)');
    });

    it('marks compilation FAILED(INFRA) if PDF artifact is missing after SUCCEEDED result', async () => {
      // Modify doc content so it is NOT a cache hit
      const uniqueText = `\\documentclass{article}\n\\begin{document}\nUnique ${Date.now()}\n\\end{document}`;
      await db.db.client.document.update({
        where: { id: mainDocId },
        data: {
          content: uniqueText,
          contentHash: crypto.createHash('sha256').update(uniqueText).digest('hex'),
          revision: 2,
        },
      });

      const createRes = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ trigger: 'MANUAL' });
      expect(createRes.status).toBe(202);
      const cid = createRes.body.data.id;

      // Do NOT put PDF in storage
      const missingPdfKey = `compilations/${cid}/missing.pdf`;

      const finishedPayload: CompileResultV1 = {
        version: 1,
        compilationId: cid,
        projectId,
        status: 'SUCCEEDED',
        exitCode: 0,
        durationMs: 1200,
        errorCount: 0,
        warningCount: 0,
        diagnostics: [],
        outputs: {
          pdfKey: missingPdfKey,
        },
        outputSizes: {
          pdfBytes: 100,
        },
      };

      await container.compilationsWorker.handleFinished(finishedPayload);

      const record = await db.db.client.compilation.findUnique({ where: { id: cid } });
      expect(record?.status).toBe('FAILED');
      expect(record?.errorCode).toBe('INFRA_ARTIFACT_MISSING');
    });

    it('is idempotent and ignores late/duplicate result messages for terminal compilations', async () => {
      // Find a succeeded compilation
      const succeeded = await db.db.client.compilation.findFirst({
        where: { projectId, status: 'SUCCEEDED' },
      });
      expect(succeeded).not.toBeNull();

      // Send another finished message attempting to mark it FAILED
      await container.compilationsWorker.handleFinished({
        version: 1,
        compilationId: succeeded!.id,
        projectId,
        status: 'FAILED',
        exitCode: 1,
        durationMs: 9999,
        errorCount: 5,
        warningCount: 0,
        diagnostics: [],
        outputs: {},
        outputSizes: {},
        errorCode: 'LATE_ERROR',
      });

      // Still SUCCEEDED!
      const after = await db.db.client.compilation.findUnique({ where: { id: succeeded!.id } });
      expect(after?.status).toBe('SUCCEEDED');
    });
  });

  describe('4. Compilation Cache Hits', () => {
    it('returns 201 SUCCEEDED cache hit when compiling with unchanged inputHash and valid PDF', async () => {
      // 1. Initiate compile
      const firstRes = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          trigger: 'MANUAL',
          engine: 'PDFLATEX',
          bibTool: 'AUTO',
        });
      expect(firstRes.status).toBe(202);
      const cid = firstRes.body.data.id;

      // 2. Put PDF into storage and complete compilation
      const pdfKey = storage.buildKey.compilation(workspaceId, projectId, cid, 'output.pdf');
      await storage.putObject(pdfKey, Buffer.from('%PDF-1.5 Cache test PDF'), 'application/pdf');

      const synctexKey = storage.buildKey.compilation(
        workspaceId,
        projectId,
        cid,
        'output.synctex.gz',
      );
      await storage.putObject(synctexKey, Buffer.from('synctex test data'), 'application/gzip');

      await container.compilationsWorker.handleFinished({
        version: 1,
        compilationId: cid,
        projectId,
        status: 'SUCCEEDED',
        exitCode: 0,
        durationMs: 800,
        errorCount: 0,
        warningCount: 0,
        diagnostics: [],
        outputs: { pdfKey, synctexKey },
        outputSizes: { pdfBytes: 24 },
      });

      // 3. Compile again with exact same document state -> cache hit!
      const cacheHitRes = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          trigger: 'MANUAL',
          engine: 'PDFLATEX',
          bibTool: 'AUTO',
        });

      expect(cacheHitRes.status).toBe(201);
      expect(cacheHitRes.body.data.cacheHit).toBe(true);
      expect(cacheHitRes.body.data.status).toBe('SUCCEEDED');
      expect(cacheHitRes.body.data.hasPdf).toBe(true);
    });
  });

  describe('5. Read & Access APIs', () => {
    it('GET /projects/:id/compilations returns paginated compilation list', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/compilations?limit=2`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.nextCursor).toBeDefined();
    });

    it('GET /projects/:id/compilations/latest returns latest compilation', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/compilations/latest`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.projectId).toBe(projectId);
    });

    it('GET /compilations/:id returns compilation details', async () => {
      const latest = await db.db.client.compilation.findFirst({
        where: { projectId },
        orderBy: { queuedAt: 'desc' },
      });

      const res = await request(app)
        .get(`/api/v1/compilations/${latest!.id}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(latest!.id);
    });

    it('GET /compilations/:id/pdf returns presigned download URL', async () => {
      const succeeded = await db.db.client.compilation.findFirst({
        where: { projectId, status: 'SUCCEEDED' },
      });

      const res = await request(app)
        .get(`/api/v1/compilations/${succeeded!.id}/pdf?download=1`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.url).toContain('http://storage.local/');
      expect(res.body.data.url).toMatch(/Quantum(\+|%20)Physics(\+|%20)Paper\.pdf/);
    });

    it('GET /compilations/:id/log returns parsed diagnostics and 302 for raw log', async () => {
      const withLog = await db.db.client.compilation.findFirst({
        where: { projectId, logKey: { not: null }, status: 'SUCCEEDED' },
      });

      // 1. JSON diagnostics
      const resJson = await request(app)
        .get(`/api/v1/compilations/${withLog!.id}/log`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(resJson.status).toBe(200);
      expect(resJson.body.data.counts).toBeDefined();
      expect(resJson.body.data.rawLogUrl).toContain('compile.log');

      // 2. Raw log 302 redirect
      const resRaw = await request(app)
        .get(`/api/v1/compilations/${withLog!.id}/log?raw=1`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(resRaw.status).toBe(302);
      expect(resRaw.headers.location).toContain('compile.log');
    });

    it('DELETE /compilations/:id cancels queued compilation', async () => {
      // Modify doc content so it is NOT a cache hit
      const uniqueText = `\\documentclass{article}\n\\begin{document}\nCancel test ${Date.now()}\n\\end{document}`;
      await db.db.client.document.update({
        where: { id: mainDocId },
        data: {
          content: uniqueText,
          contentHash: crypto.createHash('sha256').update(uniqueText).digest('hex'),
          revision: 3,
        },
      });

      // Create fresh queued compilation
      const createRes = await request(app)
        .post(`/api/v1/projects/${projectId}/compilations`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ trigger: 'MANUAL', draft: true });

      expect(createRes.status).toBe(202);
      const cid = createRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/v1/compilations/${cid}`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(delRes.status).toBe(202);
      expect(delRes.body.data.cancelled).toBe(true);

      const after = await db.db.client.compilation.findUnique({ where: { id: cid } });
      expect(after?.status).toBe('CANCELLED');
    });

    it('DELETE /compilations/:id returns 409 if compilation is already finished', async () => {
      const succeeded = await db.db.client.compilation.findFirst({
        where: { projectId, status: 'SUCCEEDED' },
      });

      const delRes = await request(app)
        .delete(`/api/v1/compilations/${succeeded!.id}`)
        .set('Authorization', `Bearer ${editorToken}`);

      expect(delRes.status).toBe(409);
    });

    it('POST /compilations/:id/synctex/forward and inverse return mapping coordinates', async () => {
      const succeeded = await db.db.client.compilation.findFirst({
        where: { projectId, status: 'SUCCEEDED', synctexKey: { not: null } },
      });

      // Forward
      const fwdRes = await request(app)
        .post(`/api/v1/compilations/${succeeded!.id}/synctex/forward`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ file: 'main.tex', line: 10, column: 1 });

      expect(fwdRes.status).toBe(200);
      expect(fwdRes.body.data.matches[0]!.page).toBe(1);

      // Inverse
      const invRes = await request(app)
        .post(`/api/v1/compilations/${succeeded!.id}/synctex/inverse`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ page: 1, x: 100, y: 200 });

      expect(invRes.status).toBe(200);
      expect(invRes.body.data.file).toBe('main.tex');
    });
  });

  describe('6. Reconciler Recovery', () => {
    it('recovers abandoned stale QUEUED compilations', async () => {
      // Create a queued compilation with an old timestamp
      const oldQueued = await db.db.client.compilation.create({
        data: {
          projectId,
          status: 'QUEUED',
          engine: 'PDFLATEX',
          bibTool: 'AUTO',
          mainFilePath: 'main.tex',
          inputHash: 'hash-stale-queued',
          docRevisions: {},
          queuedAt: new Date(Date.now() - 45000), // 45 seconds ago
        },
      });

      const { recoveredQueued } = await container.compilationsReconciler.reconcile();
      expect(recoveredQueued).toBeGreaterThanOrEqual(1);

      const after = await db.db.client.compilation.findUnique({ where: { id: oldQueued.id } });
      expect(after?.status).toBe('FAILED');
      expect(after?.errorCode).toBe('ORPHANED_QUEUED_JOB');
    });

    it('recovers abandoned stale RUNNING compilations', async () => {
      const oldRunning = await db.db.client.compilation.create({
        data: {
          projectId,
          status: 'RUNNING',
          engine: 'PDFLATEX',
          bibTool: 'AUTO',
          mainFilePath: 'main.tex',
          inputHash: 'hash-stale-running',
          docRevisions: {},
          queuedAt: new Date(Date.now() - 400000),
          startedAt: new Date(Date.now() - 350000), // 350 seconds ago (>300s threshold)
        },
      });

      const { recoveredRunning } = await container.compilationsReconciler.reconcile();
      expect(recoveredRunning).toBeGreaterThanOrEqual(1);

      const after = await db.db.client.compilation.findUnique({ where: { id: oldRunning.id } });
      expect(after?.status).toBe('FAILED');
      expect(after?.errorCode).toBe('RUNNER_TIMEOUT_OR_LOST');
    });
  });
});
