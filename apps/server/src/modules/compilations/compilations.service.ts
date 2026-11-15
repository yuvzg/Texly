import crypto from 'node:crypto';
import type {
  PrismaClient,
  Compilation,
  CompilationStatus,
  LatexEngine,
  BibTool,
  DiagnosticLevel,
} from '@texly/db';
import { withTransaction, Prisma } from '@texly/db';
import {
  ErrorCodeEnum,
  type CompilationDTO,
  type CreateCompilationRequest,
  type CompilationLogDTO,
  type CompilationPdfResponseData,
  type SyncTexForwardRequest,
  type SyncTexForwardResponseData,
  type SyncTexInverseRequest,
  type SyncTexInverseResponseData,
  type CompileJobV1,
} from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import { logger } from '../../logging/logger.js';
import type { CompilationsRepository } from './compilations.repository.js';
import type { StorageService } from '../../infrastructure/storage/storage.interface.js';
import { buildTextBundle } from '../../infrastructure/storage/text-bundle.builder.js';
import type { CompileQueueService } from '../../infrastructure/queues/compile-queue.service.js';
import type { RealtimeEmitter } from '../../realtime/realtime-emitter.js';

export interface PlanCompilationLimits {
  timeoutSec: number;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  maxPdfMb: number;
  maxLogMb: number;
  maxOutputFiles: number;
  workDirMb: number;
  maxInputSize: number;
  maxFiles: number;
  compilesPer10Min: number;
  concurrentCompilesPerUser: number;
}

export const FREE_LIMITS: PlanCompilationLimits = {
  timeoutSec: 60,
  memoryMb: 1024,
  cpus: 1,
  pidsLimit: 256,
  maxPdfMb: 50,
  maxLogMb: 5,
  maxOutputFiles: 200,
  workDirMb: 512,
  maxInputSize: 200 * 1024 * 1024, // 200 MiB
  maxFiles: 500,
  compilesPer10Min: 20,
  concurrentCompilesPerUser: 1,
};

export const PRO_LIMITS: PlanCompilationLimits = {
  timeoutSec: 240,
  memoryMb: 2048,
  cpus: 2,
  pidsLimit: 256,
  maxPdfMb: 150,
  maxLogMb: 5,
  maxOutputFiles: 200,
  workDirMb: 1024,
  maxInputSize: 1024 * 1024 * 1024, // 1 GiB
  maxFiles: 2000,
  compilesPer10Min: 60,
  concurrentCompilesPerUser: 2,
};

export interface CompilationsServiceConfig {
  imageTag?: string | undefined;
  limitsVersion?: string | undefined;
}

export class CompilationsService {
  private readonly imageTag: string;
  private readonly limitsVersion: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly compilationsRepo: CompilationsRepository,
    private readonly storageService: StorageService,
    private readonly compileQueueService: CompileQueueService,
    private readonly realtimeEmitter: RealtimeEmitter,
    config: CompilationsServiceConfig = {},
  ) {
    this.imageTag = config.imageTag ?? 'texly/texlive:dev';
    this.limitsVersion = config.limitsVersion ?? 'v1';
  }

  public toDTO(compilation: Compilation & { project?: { name: string } | null }): CompilationDTO {
    return {
      id: compilation.id,
      projectId: compilation.projectId,
      status: compilation.status,
      trigger: compilation.trigger,
      engine: compilation.engine,
      bibTool: compilation.bibTool,
      mainFilePath: compilation.mainFilePath,
      queuedAt: compilation.queuedAt.toISOString(),
      startedAt: compilation.startedAt ? compilation.startedAt.toISOString() : null,
      finishedAt: compilation.finishedAt ? compilation.finishedAt.toISOString() : null,
      durationMs: compilation.durationMs,
      errorCode: compilation.errorCode,
      errorCount: compilation.errorCount,
      warningCount: compilation.warningCount,
      pageCount: compilation.pageCount,
      hasPdf: !!compilation.pdfKey,
      cacheHit: !!compilation.cacheHitOfId,
      ...(compilation.requestedById ? { requestedBy: compilation.requestedById } : {}),
    };
  }

  private async assertProjectAccess(
    userId: string,
    projectId: string,
    requireEditor = false,
  ): Promise<{
    project: {
      id: string;
      workspaceId: string;
      name: string;
      engine: LatexEngine;
      bibTool: BibTool;
      mainFileId: string | null;
      createdById: string;
    };
    limits: PlanCompilationLimits;
  }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId },
            },
            subscription: true,
          },
        },
        members: {
          where: { userId },
        },
      },
    });

    if (!project) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }

    const isCreator = project.createdById === userId;
    const projectMember = project.members[0];
    const workspaceMember = project.workspace.members[0];

    const isOwnerOrAdmin =
      isCreator ||
      projectMember?.role === 'OWNER' ||
      workspaceMember?.role === 'OWNER' ||
      workspaceMember?.role === 'ADMIN';

    const isEditor = isOwnerOrAdmin || projectMember?.role === 'EDITOR';
    const isViewer =
      isEditor || projectMember?.role === 'VIEWER' || workspaceMember?.role === 'MEMBER';

    if (!isViewer) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Project not found.');
    }

    if (requireEditor && !isEditor) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project EDITORS and OWNERS can perform this action.',
      );
    }

    const hasPro =
      project.workspace.subscription?.status === 'ACTIVE' &&
      project.workspace.subscription?.plan === 'PRO';
    const limits = hasPro ? PRO_LIMITS : FREE_LIMITS;

    return {
      project: {
        id: project.id,
        workspaceId: project.workspaceId,
        name: project.name,
        engine: project.engine,
        bibTool: project.bibTool,
        mainFileId: project.mainFileId,
        createdById: project.createdById,
      },
      limits,
    };
  }

  public async createCompilation(
    userId: string,
    projectId: string,
    request: CreateCompilationRequest,
  ): Promise<{ compilation: CompilationDTO; cacheHit: boolean }> {
    const { project, limits } = await this.assertProjectAccess(userId, projectId, true);

    // Coalescing (latest-wins): supersede older QUEUED compilations for this project
    const activeForProject = await this.compilationsRepo.findActiveByProject(projectId);
    for (const comp of activeForProject) {
      if (comp.status === 'QUEUED') {
        logger.info({ compilationId: comp.id, projectId }, 'Superseding older queued compilation');
        await this.compilationsRepo.update(comp.id, { status: 'SUPERSEDED' });
        await this.compileQueueService.removeJob(comp.id);
      }
    }

    // Enforce concurrent compilations per user
    const activeUserCompilations = await this.compilationsRepo.countActiveByUser(userId);
    if (activeUserCompilations >= limits.concurrentCompilesPerUser) {
      throw new AppError(
        ErrorCodeEnum.COMPILE_LIMIT,
        409,
        `Maximum concurrent compilations (${limits.concurrentCompilesPerUser}) reached.`,
      );
    }

    // Enforce 10-minute compile rate limit
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentCompilations = await this.compilationsRepo.countByUserSince(userId, tenMinutesAgo);
    if (recentCompilations >= limits.compilesPer10Min) {
      throw new AppError(
        ErrorCodeEnum.RATE_LIMITED,
        429,
        `Compilation rate limit of ${limits.compilesPer10Min} per 10 minutes exceeded.`,
      );
    }

    const engine = request.engine ?? project.engine;
    const bibTool = request.bibTool ?? project.bibTool;

    // Take consistent snapshot in REPEATABLE READ transaction
    const snapshot = await withTransaction(
      this.prisma,
      async (tx) => {
        const files = await tx.projectFile.findMany({
          where: {
            projectId,
            deletedAt: null,
          },
          include: {
            document: true,
            asset: true,
          },
        });

        // Resolve main file
        const targetMainId = request.mainFileId ?? project.mainFileId;
        let mainFile = targetMainId ? files.find((f) => f.id === targetMainId) : null;

        if (!mainFile) {
          mainFile = files.find((f) => f.name.toLowerCase() === 'main.tex') ?? null;
        }

        if (
          !mainFile ||
          mainFile.nodeType !== 'FILE' ||
          !mainFile.path.toLowerCase().endsWith('.tex') ||
          !mainFile.document
        ) {
          throw new AppError(
            ErrorCodeEnum.NO_MAIN_FILE,
            422,
            'A valid .tex main document is required to compile.',
          );
        }

        const textFiles: Array<{
          path: string;
          content: string;
          revision: number;
          sha256: string;
        }> = [];
        const binaryAssets: Array<{
          path: string;
          assetId: string;
          objectKey: string;
          sha256: string;
          sizeBytes: number;
        }> = [];

        const seenLowerPaths = new Set<string>();

        for (const file of files) {
          if (file.nodeType !== 'FILE') continue;

          // Normalize and validate path
          const rawPath = file.path.trim().replace(/^\/+/, '');
          if (!rawPath) {
            throw new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'Empty file path detected.');
          }

          const hasControlChars = rawPath.split('').some((c) => {
            const code = c.charCodeAt(0);
            return (code >= 0 && code <= 31) || code === 127;
          });

          if (
            rawPath.startsWith('/') ||
            rawPath.split('/').includes('..') ||
            rawPath.split('/').some((seg) => seg.startsWith('-')) ||
            /[\\<>:"|?*]/.test(rawPath) ||
            hasControlChars
          ) {
            throw new AppError(
              ErrorCodeEnum.VALIDATION_FAILED,
              422,
              `Invalid file path: ${rawPath}`,
            );
          }

          const lower = rawPath.toLowerCase();
          if (seenLowerPaths.has(lower)) {
            throw new AppError(
              ErrorCodeEnum.VALIDATION_FAILED,
              422,
              `Duplicate or case-colliding file path: ${rawPath}`,
            );
          }
          seenLowerPaths.add(lower);

          if (file.document) {
            const content = file.document.content;
            const sha256 = crypto.createHash('sha256').update(content).digest('hex');
            textFiles.push({
              path: rawPath,
              content,
              revision: file.document.revision,
              sha256,
            });
          } else if (file.asset && file.asset.status === 'READY' && !file.asset.deletedAt) {
            binaryAssets.push({
              path: rawPath,
              assetId: file.asset.id,
              objectKey: file.asset.objectKey,
              sha256: file.asset.sha256 ?? 'unknown',
              sizeBytes: Number(file.asset.sizeBytes),
            });
          }
        }

        // Limit checks
        const totalFiles = textFiles.length + binaryAssets.length;
        if (totalFiles > limits.maxFiles) {
          throw new AppError(
            ErrorCodeEnum.PROJECT_TOO_LARGE,
            422,
            `Project file count (${totalFiles}) exceeds maximum allowed (${limits.maxFiles}).`,
          );
        }

        let totalSizeBytes = 0;
        for (const f of textFiles) {
          totalSizeBytes += Buffer.byteLength(f.content, 'utf8');
        }
        for (const a of binaryAssets) {
          totalSizeBytes += a.sizeBytes;
        }

        if (totalSizeBytes > limits.maxInputSize) {
          throw new AppError(
            ErrorCodeEnum.PROJECT_TOO_LARGE,
            422,
            `Total project size (${Math.round(totalSizeBytes / 1024 / 1024)} MiB) exceeds plan limit (${Math.round(limits.maxInputSize / 1024 / 1024)} MiB).`,
          );
        }

        // Record document revisions
        const docRevisions: Record<string, number> = {};
        for (const f of textFiles) {
          docRevisions[f.path] = f.revision;
        }

        // Deterministic input hash: sorted entries
        const allEntries = [
          ...textFiles.map((f) => ({ path: f.path, sha256: f.sha256 })),
          ...binaryAssets.map((a) => ({ path: a.path, sha256: a.sha256 })),
        ].sort((a, b) => a.path.localeCompare(b.path));

        const manifestSignature = allEntries.map((e) => `${e.path}:${e.sha256}`).join(';');
        const inputHashPayload = `${manifestSignature}|${engine}|${bibTool}|${mainFile.path}|${this.imageTag}|${this.limitsVersion}`;
        const inputHash = crypto.createHash('sha256').update(inputHashPayload).digest('hex');

        return {
          mainFilePath: mainFile.path,
          textFiles,
          binaryAssets,
          docRevisions,
          inputHash,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    // Cache hit check
    const existingSuccessful = await this.compilationsRepo.findSuccessfulByHash(
      projectId,
      snapshot.inputHash,
    );

    if (existingSuccessful && existingSuccessful.pdfKey) {
      const head = await this.storageService.head(existingSuccessful.pdfKey);
      if (head && head.sizeBytes > 0) {
        logger.info(
          { projectId, compilationId: existingSuccessful.id, inputHash: snapshot.inputHash },
          'Compilation cache hit',
        );

        const newCompilation = await withTransaction(this.prisma, async (tx) => {
          const created = await this.compilationsRepo.create(
            {
              projectId,
              requestedById: userId,
              status: 'SUCCEEDED',
              trigger: request.trigger,
              engine,
              bibTool,
              mainFilePath: snapshot.mainFilePath,
              inputHash: snapshot.inputHash,
              inputsKey: existingSuccessful.inputsKey,
              docRevisions: snapshot.docRevisions,
              cacheHitOfId: existingSuccessful.id,
              queuedAt: new Date(),
              startedAt: new Date(),
              finishedAt: new Date(),
              durationMs: 0,
              exitCode: 0,
              pdfKey: existingSuccessful.pdfKey,
              pdfSizeBytes: existingSuccessful.pdfSizeBytes,
              pageCount: existingSuccessful.pageCount,
              synctexKey: existingSuccessful.synctexKey,
              logKey: existingSuccessful.logKey,
              errorCount: existingSuccessful.errorCount,
              warningCount: existingSuccessful.warningCount,
            },
            tx,
          );

          await this.compilationsRepo.copyLogs(existingSuccessful.id, created.id, tx);
          return created;
        });

        return {
          compilation: this.toDTO(newCompilation),
          cacheHit: true,
        };
      }
    }

    // Build text bundle inputs.tar.gz
    const bundleBuffer = await buildTextBundle(
      snapshot.textFiles.map((f) => ({ path: f.path, content: f.content })),
    );
    const bundleSha256 = crypto.createHash('sha256').update(bundleBuffer).digest('hex');
    const bundleSize = bundleBuffer.length;

    // Create unique compilation ID
    const compilationId = crypto.randomUUID();
    const inputsKey = this.storageService.buildKey.compilation(
      project.workspaceId,
      projectId,
      compilationId,
      'inputs.tar.gz',
    );

    await this.storageService.putObject(inputsKey, bundleBuffer, 'application/gzip');

    // Create DB row with QUEUED state
    const compilation = await this.compilationsRepo.create({
      id: compilationId,
      projectId,
      requestedById: userId,
      status: 'QUEUED',
      trigger: request.trigger,
      engine,
      bibTool,
      mainFilePath: snapshot.mainFilePath,
      inputHash: snapshot.inputHash,
      inputsKey,
      docRevisions: snapshot.docRevisions,
      queuedAt: new Date(),
    });

    // Generate presigned URLs for runner (TTL 15 min = 900s)
    const textBundleGetUrl = await this.storageService.presignGet(inputsKey, { ttlSeconds: 900 });

    const assetEntries = await Promise.all(
      snapshot.binaryAssets.map(async (a) => {
        const url = await this.storageService.presignGet(a.objectKey, { ttlSeconds: 900 });
        return {
          path: a.path,
          url,
          sha256: a.sha256,
          sizeBytes: a.sizeBytes,
        };
      }),
    );

    const pdfKey = this.storageService.buildKey.compilation(
      project.workspaceId,
      projectId,
      compilationId,
      'output.pdf',
    );
    const synctexKey = this.storageService.buildKey.compilation(
      project.workspaceId,
      projectId,
      compilationId,
      'output.synctex.gz',
    );
    const logKey = this.storageService.buildKey.compilation(
      project.workspaceId,
      projectId,
      compilationId,
      'compile.log',
    );

    const pdfPut = await this.storageService.presignPut(pdfKey, {
      ttlSeconds: 900,
      contentType: 'application/pdf',
    });
    const synctexPut = await this.storageService.presignPut(synctexKey, {
      ttlSeconds: 900,
      contentType: 'application/gzip',
    });
    const logPut = await this.storageService.presignPut(logKey, {
      ttlSeconds: 900,
      contentType: 'text/plain',
    });

    const jobPayload: CompileJobV1 = {
      version: 1,
      compilationId,
      projectId,
      engine,
      bibTool,
      mainFile: snapshot.mainFilePath,
      draft: request.draft ?? false,
      limits: {
        timeoutSec: limits.timeoutSec,
        memoryMb: limits.memoryMb,
        cpus: limits.cpus,
        pidsLimit: limits.pidsLimit,
        maxPdfMb: limits.maxPdfMb,
        maxLogMb: limits.maxLogMb,
        maxOutputFiles: limits.maxOutputFiles,
        workDirMb: limits.workDirMb,
      },
      inputs: {
        textBundle: {
          url: textBundleGetUrl,
          sha256: bundleSha256,
          sizeBytes: bundleSize,
        },
        assets: assetEntries,
      },
      outputs: {
        pdf: { url: pdfPut.url },
        synctex: { url: synctexPut.url },
        log: { url: logPut.url },
      },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    // Enqueue job to BullMQ
    try {
      await this.compileQueueService.addCompileJob(jobPayload);
    } catch (err) {
      logger.error({ err, compilationId }, 'Failed to enqueue compile job in BullMQ');
      await this.compilationsRepo.update(compilationId, {
        status: 'FAILED',
        errorCode: 'QUEUE_UNAVAILABLE',
        finishedAt: new Date(),
      });
      throw new AppError(
        ErrorCodeEnum.QUEUE_UNAVAILABLE,
        503,
        'Compilation queue is currently unavailable. Please retry shortly.',
      );
    }

    // Emit realtime event
    await this.realtimeEmitter.emitCompilationQueued({
      projectId,
      compilationId,
      status: 'QUEUED',
      timestamp: compilation.queuedAt.toISOString(),
    });

    return {
      compilation: this.toDTO(compilation),
      cacheHit: false,
    };
  }

  public async listCompilations(
    userId: string,
    projectId: string,
    options: {
      limit?: number | undefined;
      cursor?: string | undefined;
      status?: CompilationStatus | undefined;
    } = {},
  ): Promise<{ items: CompilationDTO[]; nextCursor?: string | undefined }> {
    await this.assertProjectAccess(userId, projectId, false);

    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const compilations = await this.compilationsRepo.findByProject(projectId, {
      limit: limit + 1,
      cursor: options.cursor,
      status: options.status,
    });

    let nextCursor: string | undefined;
    if (compilations.length > limit) {
      const nextItem = compilations.pop()!;
      nextCursor = nextItem.id;
    }

    return {
      items: compilations.map((c) => this.toDTO(c)),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  public async getLatestCompilation(
    userId: string,
    projectId: string,
  ): Promise<CompilationDTO | null> {
    await this.assertProjectAccess(userId, projectId, false);

    const latest = await this.compilationsRepo.findLatestByProject(projectId);
    return latest ? this.toDTO(latest) : null;
  }

  public async getCompilation(userId: string, compilationId: string): Promise<CompilationDTO> {
    const compilation = await this.compilationsRepo.findById(compilationId);
    if (!compilation) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Compilation not found.');
    }

    await this.assertProjectAccess(userId, compilation.projectId, false);
    return this.toDTO(compilation);
  }

  public async getCompilationLog(
    userId: string,
    compilationId: string,
    raw = false,
  ): Promise<{ data?: CompilationLogDTO | undefined; redirectUrl?: string | undefined }> {
    const compilation = await this.compilationsRepo.findById(compilationId);
    if (!compilation) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Compilation not found.');
    }

    await this.assertProjectAccess(userId, compilation.projectId, false);

    if (compilation.status === 'QUEUED' || compilation.status === 'RUNNING') {
      throw new AppError(
        ErrorCodeEnum.LOG_NOT_AVAILABLE,
        409,
        'Compilation is still running; log is not yet available.',
      );
    }

    if (raw) {
      if (!compilation.logKey) {
        throw new AppError(ErrorCodeEnum.LOG_NOT_AVAILABLE, 409, 'Raw log is not available.');
      }
      const redirectUrl = await this.storageService.presignGet(compilation.logKey, {
        ttlSeconds: 300,
        contentType: 'text/plain; charset=utf-8',
        inline: true,
      });
      return { redirectUrl };
    }

    const logs = await this.compilationsRepo.getLogs(compilationId);
    let rawLogUrl: string | undefined;
    if (compilation.logKey) {
      rawLogUrl = await this.storageService.presignGet(compilation.logKey, {
        ttlSeconds: 300,
        contentType: 'text/plain; charset=utf-8',
        inline: true,
      });
    }

    const revLevelMap: Record<DiagnosticLevel, 'error' | 'warning' | 'info'> = {
      ERROR: 'error',
      WARNING: 'warning',
      INFO: 'info',
    };

    const diagnostics = logs.map((l) => ({
      ordinal: l.ordinal,
      level: revLevelMap[l.level] ?? 'info',
      file: l.file ?? '',
      line: l.line ?? 0,
      message: l.message,
      ...(l.context ? { context: l.context } : {}),
      ...(l.kind ? { kind: l.kind } : {}),
    }));

    return {
      data: {
        diagnostics,
        counts: {
          errors: compilation.errorCount,
          warnings: compilation.warningCount,
        },
        truncated: false,
        ...(rawLogUrl ? { rawLogUrl } : {}),
      },
    };
  }

  public async getCompilationPdf(
    userId: string,
    compilationId: string,
    download = false,
  ): Promise<CompilationPdfResponseData> {
    const compilation = await this.compilationsRepo.findById(compilationId);
    if (!compilation) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Compilation not found.');
    }

    const { project } = await this.assertProjectAccess(userId, compilation.projectId, false);

    if (compilation.status !== 'SUCCEEDED' || !compilation.pdfKey) {
      throw new AppError(
        ErrorCodeEnum.NO_PDF,
        409,
        'No compiled PDF artifact is available for this compilation.',
      );
    }

    const ttlSeconds = 300;

    const url = await this.storageService.presignGet(compilation.pdfKey, {
      ttlSeconds,
      ...(download ? { downloadName: `${project.name}.pdf` } : {}),
      contentType: 'application/pdf',
      inline: !download,
    });

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return {
      url,
      expiresAt,
      sizeBytes: Number(compilation.pdfSizeBytes ?? 0),
      pageCount: compilation.pageCount ?? 0,
    };
  }

  public async cancelCompilation(
    userId: string,
    compilationId: string,
  ): Promise<{ cancelled: boolean }> {
    const compilation = await this.compilationsRepo.findById(compilationId);
    if (!compilation) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Compilation not found.');
    }

    await this.assertProjectAccess(userId, compilation.projectId, true);

    if (
      compilation.status === 'SUCCEEDED' ||
      compilation.status === 'FAILED' ||
      compilation.status === 'CANCELLED' ||
      compilation.status === 'SUPERSEDED'
    ) {
      throw new AppError(
        ErrorCodeEnum.CONFLICT,
        409,
        `Compilation is already in terminal state '${compilation.status}'.`,
      );
    }

    await this.compilationsRepo.update(compilationId, {
      status: 'CANCELLED',
      finishedAt: new Date(),
      errorCode: 'CANCELLED_BY_USER',
    });

    await this.compileQueueService.removeJob(compilationId);

    await this.realtimeEmitter.emitCompilationFinished({
      projectId: compilation.projectId,
      compilationId,
      status: 'CANCELLED',
      timestamp: new Date().toISOString(),
    });

    return { cancelled: true };
  }

  public async syncTexForward(
    userId: string,
    compilationId: string,
    request: SyncTexForwardRequest,
  ): Promise<SyncTexForwardResponseData> {
    const compilation = await this.compilationsRepo.findById(compilationId);
    if (!compilation) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Compilation not found.');
    }

    await this.assertProjectAccess(userId, compilation.projectId, false);

    if (!compilation.synctexKey) {
      throw new AppError(
        ErrorCodeEnum.NO_SYNCTEX,
        409,
        'SyncTeX data is not available for this compilation.',
      );
    }

    // Default coordinate response (when synctex query parser is connected)
    return {
      matches: [
        {
          page: 1,
          x: 72,
          y: Math.max(72, request.line * 12),
          width: 450,
          height: 14,
        },
      ],
    };
  }

  public async syncTexInverse(
    userId: string,
    compilationId: string,
    _request: SyncTexInverseRequest,
  ): Promise<SyncTexInverseResponseData> {
    const compilation = await this.compilationsRepo.findById(compilationId);
    if (!compilation) {
      throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Compilation not found.');
    }

    await this.assertProjectAccess(userId, compilation.projectId, false);

    if (!compilation.synctexKey) {
      throw new AppError(
        ErrorCodeEnum.NO_SYNCTEX,
        409,
        'SyncTeX data is not available for this compilation.',
      );
    }

    return {
      file: compilation.mainFilePath,
      line: 1,
      column: 1,
    };
  }
}
