import type {
  PrismaClient,
  TransactionClient,
  Compilation,
  CompilationLog,
  CompilationStatus,
  DiagnosticLevel,
} from '@texly/db';

export interface CreateCompilationInput {
  id?: string | undefined;
  projectId: string;
  requestedById?: string | null | undefined;
  status?: CompilationStatus | undefined;
  trigger?: 'MANUAL' | 'AUTO' | 'AI_ACCEPT' | 'RESTORE' | undefined;
  engine: 'PDFLATEX' | 'XELATEX' | 'LUALATEX';
  bibTool: 'AUTO' | 'BIBTEX' | 'BIBER' | 'NONE';
  mainFilePath: string;
  inputHash: string;
  inputsKey?: string | null | undefined;
  docRevisions: Record<string, number>;
  cacheHitOfId?: string | null | undefined;
  bullJobId?: string | null | undefined;
  workerId?: string | null | undefined;
  queuedAt?: Date | undefined;
  startedAt?: Date | null | undefined;
  finishedAt?: Date | null | undefined;
  durationMs?: number | null | undefined;
  exitCode?: number | null | undefined;
  errorCode?: string | null | undefined;
  pdfKey?: string | null | undefined;
  pdfSizeBytes?: bigint | null | undefined;
  pageCount?: number | null | undefined;
  synctexKey?: string | null | undefined;
  logKey?: string | null | undefined;
  errorCount?: number | undefined;
  warningCount?: number | undefined;
}

export interface UpdateCompilationInput {
  status?: CompilationStatus | undefined;
  startedAt?: Date | null | undefined;
  finishedAt?: Date | null | undefined;
  durationMs?: number | null | undefined;
  exitCode?: number | null | undefined;
  errorCode?: string | null | undefined;
  pdfKey?: string | null | undefined;
  pdfSizeBytes?: bigint | null | undefined;
  pageCount?: number | null | undefined;
  synctexKey?: string | null | undefined;
  logKey?: string | null | undefined;
  errorCount?: number | undefined;
  warningCount?: number | undefined;
  workerId?: string | null | undefined;
  bullJobId?: string | null | undefined;
}

export interface CompilationLogInput {
  ordinal: number;
  level: DiagnosticLevel;
  file?: string | null | undefined;
  line?: number | null | undefined;
  message: string;
  context?: string | null | undefined;
  kind?: string | null | undefined;
}

export class CompilationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async create(
    data: CreateCompilationInput,
    tx?: TransactionClient | undefined,
  ): Promise<Compilation> {
    const client = tx ?? this.prisma;
    return client.compilation.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        projectId: data.projectId,
        requestedById: data.requestedById ?? null,
        status: data.status ?? 'QUEUED',
        trigger: data.trigger ?? 'MANUAL',
        engine: data.engine,
        bibTool: data.bibTool,
        mainFilePath: data.mainFilePath,
        inputHash: data.inputHash,
        inputsKey: data.inputsKey ?? null,
        docRevisions: data.docRevisions,
        cacheHitOfId: data.cacheHitOfId ?? null,
        bullJobId: data.bullJobId ?? null,
        workerId: data.workerId ?? null,
        queuedAt: data.queuedAt ?? new Date(),
        startedAt: data.startedAt ?? null,
        finishedAt: data.finishedAt ?? null,
        durationMs: data.durationMs ?? null,
        exitCode: data.exitCode ?? null,
        errorCode: data.errorCode ?? null,
        pdfKey: data.pdfKey ?? null,
        pdfSizeBytes: data.pdfSizeBytes ?? null,
        pageCount: data.pageCount ?? null,
        synctexKey: data.synctexKey ?? null,
        logKey: data.logKey ?? null,
        errorCount: data.errorCount ?? 0,
        warningCount: data.warningCount ?? 0,
      },
    });
  }

  public async findById(
    id: string,
    tx?: TransactionClient | undefined,
  ): Promise<Compilation | null> {
    const client = tx ?? this.prisma;
    return client.compilation.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            workspaceId: true,
            name: true,
          },
        },
      },
    });
  }

  public async findByProject(
    projectId: string,
    options: {
      limit: number;
      cursor?: string | undefined;
      status?: CompilationStatus | undefined;
    },
  ): Promise<Compilation[]> {
    return this.prisma.compilation.findMany({
      where: {
        projectId,
        ...(options.status ? { status: options.status } : {}),
      },
      take: options.limit,
      ...(options.cursor
        ? {
            skip: 1,
            cursor: { id: options.cursor },
          }
        : {}),
      orderBy: { queuedAt: 'desc' },
    });
  }

  public async findLatestByProject(projectId: string): Promise<Compilation | null> {
    return this.prisma.compilation.findFirst({
      where: { projectId },
      orderBy: { queuedAt: 'desc' },
    });
  }

  public async findSuccessfulByHash(
    projectId: string,
    inputHash: string,
    tx?: TransactionClient | undefined,
  ): Promise<Compilation | null> {
    const client = tx ?? this.prisma;
    return client.compilation.findFirst({
      where: {
        projectId,
        inputHash,
        status: 'SUCCEEDED',
        pdfKey: { not: null },
      },
      orderBy: { queuedAt: 'desc' },
    });
  }

  public async findActiveByProject(
    projectId: string,
    tx?: TransactionClient | undefined,
  ): Promise<Compilation[]> {
    const client = tx ?? this.prisma;
    return client.compilation.findMany({
      where: {
        projectId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: { queuedAt: 'asc' },
    });
  }

  public async countActiveByUser(userId: string): Promise<number> {
    return this.prisma.compilation.count({
      where: {
        requestedById: userId,
        status: { in: ['QUEUED', 'RUNNING'] },
        project: {
          trashedAt: null,
        },
      },
    });
  }

  public async findActiveByUser(userId: string): Promise<Compilation[]> {
    return this.prisma.compilation.findMany({
      where: {
        requestedById: userId,
        status: { in: ['QUEUED', 'RUNNING'] },
        project: {
          trashedAt: null,
        },
      },
      orderBy: { queuedAt: 'asc' },
    });
  }

  public async countByUserSince(userId: string, since: Date): Promise<number> {
    return this.prisma.compilation.count({
      where: {
        requestedById: userId,
        queuedAt: { gte: since },
      },
    });
  }

  public async update(
    id: string,
    data: UpdateCompilationInput,
    tx?: TransactionClient | undefined,
  ): Promise<Compilation> {
    const client = tx ?? this.prisma;
    return client.compilation.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
        ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
        ...(data.durationMs !== undefined ? { durationMs: data.durationMs } : {}),
        ...(data.exitCode !== undefined ? { exitCode: data.exitCode } : {}),
        ...(data.errorCode !== undefined ? { errorCode: data.errorCode } : {}),
        ...(data.pdfKey !== undefined ? { pdfKey: data.pdfKey } : {}),
        ...(data.pdfSizeBytes !== undefined ? { pdfSizeBytes: data.pdfSizeBytes } : {}),
        ...(data.pageCount !== undefined ? { pageCount: data.pageCount } : {}),
        ...(data.synctexKey !== undefined ? { synctexKey: data.synctexKey } : {}),
        ...(data.logKey !== undefined ? { logKey: data.logKey } : {}),
        ...(data.errorCount !== undefined ? { errorCount: data.errorCount } : {}),
        ...(data.warningCount !== undefined ? { warningCount: data.warningCount } : {}),
        ...(data.workerId !== undefined ? { workerId: data.workerId } : {}),
        ...(data.bullJobId !== undefined ? { bullJobId: data.bullJobId } : {}),
      },
    });
  }

  public async createLogs(
    compilationId: string,
    logs: CompilationLogInput[],
    tx?: TransactionClient | undefined,
  ): Promise<void> {
    if (logs.length === 0) return;
    const client = tx ?? this.prisma;

    await client.compilationLog.createMany({
      data: logs.map((log) => ({
        compilationId,
        ordinal: log.ordinal,
        level: log.level,
        file: log.file ?? null,
        line: log.line ?? null,
        message: log.message,
        context: log.context ?? null,
        kind: log.kind ?? null,
      })),
      skipDuplicates: true,
    });
  }

  public async getLogs(compilationId: string): Promise<CompilationLog[]> {
    return this.prisma.compilationLog.findMany({
      where: { compilationId },
      orderBy: { ordinal: 'asc' },
    });
  }

  public async copyLogs(
    fromCompilationId: string,
    toCompilationId: string,
    tx?: TransactionClient | undefined,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const logs = await client.compilationLog.findMany({
      where: { compilationId: fromCompilationId },
      orderBy: { ordinal: 'asc' },
    });

    if (logs.length > 0) {
      await client.compilationLog.createMany({
        data: logs.map((log: CompilationLog) => ({
          compilationId: toCompilationId,
          ordinal: log.ordinal,
          level: log.level,
          file: log.file,
          line: log.line,
          message: log.message,
          context: log.context,
          kind: log.kind,
        })),
        skipDuplicates: true,
      });
    }
  }

  public async findStaleQueued(olderThan: Date): Promise<Compilation[]> {
    return this.prisma.compilation.findMany({
      where: {
        status: 'QUEUED',
        queuedAt: { lt: olderThan },
      },
    });
  }

  public async findStaleRunning(olderThan: Date): Promise<Compilation[]> {
    return this.prisma.compilation.findMany({
      where: {
        status: 'RUNNING',
        startedAt: { lt: olderThan },
      },
    });
  }
}
