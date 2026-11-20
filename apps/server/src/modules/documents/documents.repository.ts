import { createHash } from 'node:crypto';
import type { PrismaClient, Document, ProjectFile, ProjectRole, WorkspaceRole } from '@texly/db';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';

export interface ProjectAccess {
  hasAccess: boolean;
  isEditor: boolean;
  projectRole: ProjectRole | null;
  workspaceRole: WorkspaceRole | null;
}

export interface UpdateDocumentContentResult {
  revision: number;
  contentHash: string;
  updatedAt: string;
  unchanged: boolean;
}

export class DocumentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async getProjectAccess(projectId: string, userId: string): Promise<ProjectAccess> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId },
            },
          },
        },
        members: {
          where: { userId },
        },
      },
    });

    if (!project || project.trashedAt !== null) {
      return {
        hasAccess: false,
        isEditor: false,
        projectRole: null,
        workspaceRole: null,
      };
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
    const hasAccess =
      isEditor || projectMember?.role === 'VIEWER' || workspaceMember?.role === 'MEMBER';

    return {
      hasAccess,
      isEditor,
      projectRole: projectMember?.role ?? null,
      workspaceRole: workspaceMember?.role ?? null,
    };
  }

  public async findProjectIdForDocument(documentId: string): Promise<string | null> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { projectId: true },
    });
    return doc?.projectId ?? null;
  }

  public async findDocument(
    projectId: string,
    documentId: string,
  ): Promise<(Document & { file: ProjectFile }) | null> {
    return this.prisma.document.findFirst({
      where: {
        id: documentId,
        projectId,
      },
      include: {
        file: true,
      },
    });
  }

  public async findMainDocument(
    projectId: string,
  ): Promise<(Document & { file: ProjectFile }) | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        mainFile: {
          include: {
            document: {
              include: {
                file: true,
              },
            },
          },
        },
      },
    });

    if (project?.mainFile?.document) {
      return project.mainFile.document;
    }

    // Fallback to first .tex file with a document in this project
    const texFile = await this.prisma.projectFile.findFirst({
      where: {
        projectId,
        name: { endsWith: '.tex' },
        deletedAt: null,
        document: { isNot: null },
      },
      include: {
        document: {
          include: {
            file: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return texFile?.document ?? null;
  }

  public async updateDocumentContent(params: {
    projectId: string;
    documentId: string;
    baseRevision: number;
    content: string;
    userId: string;
  }): Promise<UpdateDocumentContentResult> {
    const { projectId, documentId, baseRevision, content, userId } = params;

    const newContentHash = createHash('sha256').update(content, 'utf8').digest('hex');
    const sizeBytes = Buffer.byteLength(content, 'utf8');

    return this.prisma.$transaction(async (tx) => {
      // Row-level lock on the document in PostgreSQL to serialize concurrent updates
      let lockedDoc: {
        id: string;
        file_id: string;
        project_id: string;
        content: string;
        content_hash: string;
        revision: number;
        size_bytes: number;
        updated_at: Date;
        updated_by_id: string | null;
      } | null = null;

      try {
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            file_id: string;
            project_id: string;
            content: string;
            content_hash: string;
            revision: number;
            size_bytes: number;
            updated_at: Date;
            updated_by_id: string | null;
          }>
        >`SELECT id, file_id, project_id, content, content_hash, revision, size_bytes, updated_at, updated_by_id
          FROM documents
          WHERE id = ${documentId} AND project_id = ${projectId}
          FOR UPDATE`;
        if (rows && rows.length > 0) {
          lockedDoc = rows[0]!;
        }
      } catch {
        // Fallback if raw query is not supported by mock/in-memory provider
      }

      if (!lockedDoc) {
        const fallback = await tx.document.findFirst({
          where: { id: documentId, projectId },
        });
        if (!fallback) {
          throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Document not found.');
        }
        lockedDoc = {
          id: fallback.id,
          file_id: fallback.fileId,
          project_id: fallback.projectId,
          content: fallback.content,
          content_hash: fallback.contentHash,
          revision: fallback.revision,
          size_bytes: fallback.sizeBytes,
          updated_at: fallback.updatedAt,
          updated_by_id: fallback.updatedById,
        };
      }

      // Optimistic concurrency check on the locked authoritative row
      if (lockedDoc.revision !== baseRevision) {
        throw new AppError(
          ErrorCodeEnum.REVISION_CONFLICT,
          409,
          'Document revision conflict. The document was modified by another request.',
          {
            serverRevision: lockedDoc.revision,
            serverHash: lockedDoc.content_hash,
            updatedAt: lockedDoc.updated_at.toISOString(),
            updatedById: lockedDoc.updated_by_id,
          },
        );
      }

      // No-op save if content hash is identical
      if (lockedDoc.content_hash === newContentHash) {
        return {
          revision: lockedDoc.revision,
          contentHash: lockedDoc.content_hash,
          updatedAt: lockedDoc.updated_at.toISOString(),
          unchanged: true,
        };
      }

      const newRevision = lockedDoc.revision + 1;
      const now = new Date();

      // Update the document
      await tx.document.update({
        where: { id: documentId },
        data: {
          content,
          contentHash: newContentHash,
          revision: newRevision,
          sizeBytes,
          updatedById: userId,
          updatedAt: now,
        },
      });

      // Update the associated project file metadata
      await tx.projectFile.update({
        where: { id: lockedDoc.file_id },
        data: {
          sizeBytes,
          updatedAt: now,
        },
      });

      // Update project updated_at
      await tx.project.update({
        where: { id: projectId },
        data: {
          updatedAt: now,
        },
      });

      // Periodic checkpoint version snapshot: if >= 10 mins since last version or first version
      const lastVersion = await tx.documentVersion.findFirst({
        where: { documentId },
        orderBy: { createdAt: 'desc' },
      });

      const TEN_MINUTES_MS = 10 * 60 * 1000;
      if (!lastVersion || now.getTime() - lastVersion.createdAt.getTime() >= TEN_MINUTES_MS) {
        await tx.documentVersion.create({
          data: {
            documentId,
            revision: newRevision,
            content,
            contentHash: newContentHash,
            sizeBytes,
            source: 'CHECKPOINT',
            createdById: userId,
            createdAt: now,
          },
        });
      }

      return {
        revision: newRevision,
        contentHash: newContentHash,
        updatedAt: now.toISOString(),
        unchanged: false,
      };
    });
  }
}
