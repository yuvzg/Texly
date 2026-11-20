import crypto from 'node:crypto';
import type { PrismaClient, ProjectFile, ProjectRole, WorkspaceRole } from '@texly/db';
import type { ProjectFileDTO } from '@texly/shared';
import { ErrorCodeEnum } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import {
  validateFileName,
  validateMaterializedPath,
  checkCircularMove,
  normalizePath,
} from './path-validator.js';

export interface ProjectAccess {
  hasAccess: boolean;
  isEditor: boolean;
  projectRole: ProjectRole | null;
  workspaceRole: WorkspaceRole | null;
}

export interface UpdateFileResult {
  file: ProjectFileDTO;
  affected: Array<{ id: string; path: string }>;
}

export interface DeleteFileResult {
  mainFileCleared: boolean;
  subtreeIds: string[];
}

export class FilesRepository {
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

  public async listFiles(
    projectId: string,
  ): Promise<{ files: ProjectFileDTO[]; mainFileId: string | null }> {
    const [project, files] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { mainFileId: true },
      }),
      this.prisma.projectFile.findMany({
        where: {
          projectId,
          deletedAt: null,
        },
        include: {
          document: {
            select: {
              id: true,
              revision: true,
            },
          },
          asset: {
            select: {
              id: true,
            },
          },
        },
        orderBy: {
          path: 'asc',
        },
      }),
    ]);

    const mappedFiles: ProjectFileDTO[] = files.map((f) => ({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
      path: f.path,
      nodeType: f.nodeType,
      kind: f.kind,
      sizeBytes: Number(f.sizeBytes),
      mimeType: f.mimeType,
      ...(f.document ? { documentId: f.document.id, revision: f.document.revision } : {}),
      ...(f.asset ? { assetId: f.asset.id } : {}),
      updatedAt: f.updatedAt.toISOString(),
    }));

    return {
      files: mappedFiles,
      mainFileId: project?.mainFileId ?? null,
    };
  }

  public async findFileById(
    projectId: string,
    fileId: string,
  ): Promise<ProjectFileDTO | null> {
    const file = await this.prisma.projectFile.findFirst({
      where: {
        id: fileId,
        projectId,
        deletedAt: null,
      },
      include: {
        document: {
          select: {
            id: true,
            revision: true,
          },
        },
        asset: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!file) {
      return null;
    }

    return {
      id: file.id,
      parentId: file.parentId,
      name: file.name,
      path: file.path,
      nodeType: file.nodeType,
      kind: file.kind,
      sizeBytes: Number(file.sizeBytes),
      mimeType: file.mimeType,
      ...(file.document ? { documentId: file.document.id, revision: file.document.revision } : {}),
      ...(file.asset ? { assetId: file.asset.id } : {}),
      updatedAt: file.updatedAt.toISOString(),
    };
  }

  public async createFolder(params: {
    projectId: string;
    parentId: string | null;
    name: string;
    userId: string;
  }): Promise<ProjectFileDTO> {
    const { projectId, parentId, name, userId } = params;

    validateFileName(name, 'FOLDER');

    return this.prisma.$transaction(async (tx) => {
      let parentPath: string | null = null;
      if (parentId) {
        const parent = await tx.projectFile.findFirst({
          where: { id: parentId, projectId, deletedAt: null },
        });
        if (!parent) {
          throw new AppError(ErrorCodeEnum.PARENT_NOT_FOUND, 404, 'Parent directory not found.');
        }
        if (parent.nodeType !== 'FOLDER') {
          throw new AppError(
            ErrorCodeEnum.INVALID_NAME,
            422,
            'Parent node is a file, not a directory.',
          );
        }
        parentPath = parent.path;
      }

      const path = parentPath ? `${parentPath}/${name}` : name;
      validateMaterializedPath(path);

      // Check case-insensitive sibling uniqueness
      const sibling = await tx.projectFile.findFirst({
        where: {
          projectId,
          parentId,
          deletedAt: null,
          name: { equals: name, mode: 'insensitive' },
        },
      });

      if (sibling) {
        throw new AppError(
          ErrorCodeEnum.NAME_TAKEN,
          409,
          `A file or folder named "${name}" already exists in this directory.`,
        );
      }

      // Check quota limit
      const count = await tx.projectFile.count({
        where: { projectId, deletedAt: null },
      });
      if (count >= 2000) {
        throw new AppError(
          ErrorCodeEnum.FILE_LIMIT_REACHED,
          409,
          'Project file limit (2,000 files) reached.',
        );
      }

      const folder = await tx.projectFile.create({
        data: {
          projectId,
          parentId,
          name,
          path,
          nodeType: 'FOLDER',
          kind: null,
          mimeType: null,
          sizeBytes: BigInt(0),
          createdById: userId,
        },
      });

      return {
        id: folder.id,
        parentId: folder.parentId,
        name: folder.name,
        path: folder.path,
        nodeType: folder.nodeType,
        kind: folder.kind,
        sizeBytes: 0,
        mimeType: null,
        updatedAt: folder.updatedAt.toISOString(),
      };
    });
  }

  public async createTextFile(params: {
    projectId: string;
    parentId: string | null;
    name: string;
    mimeType: string;
    content?: string | undefined;
    userId: string;
  }): Promise<ProjectFileDTO & { documentId: string }> {
    const { projectId, parentId, name, mimeType, userId } = params;
    const rawContent = params.content ?? '';
    // Normalize line endings CRLF to LF
    const content = rawContent.replace(/\r\n/g, '\n');

    validateFileName(name, 'FILE');

    const sizeBytes = Buffer.byteLength(content, 'utf8');
    if (sizeBytes > 2 * 1024 * 1024) {
      throw new AppError(
        ErrorCodeEnum.PAYLOAD_TOO_LARGE,
        413,
        'Text file initial content exceeds 2 MiB limit.',
      );
    }

    const contentHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

    return this.prisma.$transaction(async (tx) => {
      let parentPath: string | null = null;
      if (parentId) {
        const parent = await tx.projectFile.findFirst({
          where: { id: parentId, projectId, deletedAt: null },
        });
        if (!parent) {
          throw new AppError(ErrorCodeEnum.PARENT_NOT_FOUND, 404, 'Parent directory not found.');
        }
        if (parent.nodeType !== 'FOLDER') {
          throw new AppError(
            ErrorCodeEnum.INVALID_NAME,
            422,
            'Parent node is a file, not a directory.',
          );
        }
        parentPath = parent.path;
      }

      const path = parentPath ? `${parentPath}/${name}` : name;
      validateMaterializedPath(path);

      // Check case-insensitive sibling collision
      const sibling = await tx.projectFile.findFirst({
        where: {
          projectId,
          parentId,
          deletedAt: null,
          name: { equals: name, mode: 'insensitive' },
        },
      });

      if (sibling) {
        throw new AppError(
          ErrorCodeEnum.NAME_TAKEN,
          409,
          `A file or folder named "${name}" already exists in this directory.`,
        );
      }

      // Check quota limit
      const count = await tx.projectFile.count({
        where: { projectId, deletedAt: null },
      });
      if (count >= 2000) {
        throw new AppError(
          ErrorCodeEnum.FILE_LIMIT_REACHED,
          409,
          'Project file limit (2,000 files) reached.',
        );
      }

      const now = new Date();

      const file = await tx.projectFile.create({
        data: {
          projectId,
          parentId,
          name,
          path,
          nodeType: 'FILE',
          kind: 'TEXT',
          mimeType,
          sizeBytes: BigInt(sizeBytes),
          createdById: userId,
          createdAt: now,
          updatedAt: now,
        },
      });

      const doc = await tx.document.create({
        data: {
          fileId: file.id,
          projectId,
          content,
          contentHash,
          revision: 1,
          sizeBytes,
          updatedById: userId,
          createdAt: now,
          updatedAt: now,
        },
      });

      // Insert initial version record
      await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          revision: 1,
          content,
          contentHash,
          sizeBytes,
          source: 'MANUAL',
          createdById: userId,
          createdAt: now,
        },
      });

      // Update project updatedAt
      await tx.project.update({
        where: { id: projectId },
        data: { updatedAt: now },
      });

      return {
        id: file.id,
        parentId: file.parentId,
        name: file.name,
        path: file.path,
        nodeType: file.nodeType,
        kind: file.kind,
        sizeBytes,
        mimeType: file.mimeType,
        documentId: doc.id,
        revision: 1,
        updatedAt: file.updatedAt.toISOString(),
      };
    });
  }

  public async updateFile(params: {
    projectId: string;
    fileId: string;
    name?: string | undefined;
    parentId?: string | null | undefined;
    userId: string;
  }): Promise<UpdateFileResult> {
    const { projectId, fileId, name: inputName, parentId: inputParentId } = params;

    return this.prisma.$transaction(async (tx) => {
      const file = await tx.projectFile.findFirst({
        where: { id: fileId, projectId, deletedAt: null },
      });

      if (!file) {
        throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'File or folder not found.');
      }

      const newName = inputName !== undefined ? inputName.trim() : file.name;
      const newParentId = inputParentId !== undefined ? inputParentId : file.parentId;

      // Validate name
      if (inputName !== undefined) {
        validateFileName(newName, file.nodeType);
      }

      // Check parent if changed or present
      let parentPath: string | null = null;
      if (newParentId !== null) {
        const parent = await tx.projectFile.findFirst({
          where: { id: newParentId, projectId, deletedAt: null },
        });

        if (!parent) {
          throw new AppError(ErrorCodeEnum.PARENT_NOT_FOUND, 404, 'Target parent directory not found.');
        }

        if (parent.nodeType !== 'FOLDER') {
          throw new AppError(
            ErrorCodeEnum.INVALID_NAME,
            422,
            'Target parent is a file, not a directory.',
          );
        }

        // Circular move check: if file is a folder, cannot move into itself or descendant
        if (file.nodeType === 'FOLDER') {
          checkCircularMove(file.path, parent.path);
        }

        parentPath = parent.path;
      }

      const newPath = normalizePath(parentPath ? `${parentPath}/${newName}` : newName);
      validateMaterializedPath(newPath);

      // Check case-insensitive sibling uniqueness if name or parent changed
      if (newName.toLowerCase() !== file.name.toLowerCase() || newParentId !== file.parentId) {
        const sibling = await tx.projectFile.findFirst({
          where: {
            projectId,
            parentId: newParentId,
            deletedAt: null,
            id: { not: file.id },
            name: { equals: newName, mode: 'insensitive' },
          },
        });

        if (sibling) {
          throw new AppError(
            ErrorCodeEnum.NAME_TAKEN,
            409,
            `A file or folder named "${newName}" already exists in the target directory.`,
          );
        }
      }

      const affected: Array<{ id: string; path: string }> = [];
      const now = new Date();

      // If directory path changed, rewrite all descendants' paths atomically
      if (file.nodeType === 'FOLDER' && newPath !== file.path) {
        const descendants = await tx.projectFile.findMany({
          where: {
            projectId,
            path: { startsWith: `${file.path}/` },
            deletedAt: null,
          },
        });

        for (const desc of descendants) {
          const suffix = desc.path.slice(file.path.length);
          const descNewPath = `${newPath}${suffix}`;
          await tx.projectFile.update({
            where: { id: desc.id },
            data: { path: descNewPath, updatedAt: now },
          });
          affected.push({ id: desc.id, path: descNewPath });
        }
      }

      const updated = await tx.projectFile.update({
        where: { id: file.id },
        data: {
          name: newName,
          parentId: newParentId,
          path: newPath,
          updatedAt: now,
        },
        include: {
          document: {
            select: { id: true, revision: true },
          },
          asset: {
            select: { id: true },
          },
        },
      });

      await tx.project.update({
        where: { id: projectId },
        data: { updatedAt: now },
      });

      return {
        file: {
          id: updated.id,
          parentId: updated.parentId,
          name: updated.name,
          path: updated.path,
          nodeType: updated.nodeType,
          kind: updated.kind,
          sizeBytes: Number(updated.sizeBytes),
          mimeType: updated.mimeType,
          ...(updated.document ? { documentId: updated.document.id, revision: updated.document.revision } : {}),
          ...(updated.asset ? { assetId: updated.asset.id } : {}),
          updatedAt: updated.updatedAt.toISOString(),
        },
        affected,
      };
    });
  }

  public async deleteFile(params: {
    projectId: string;
    fileId: string;
  }): Promise<DeleteFileResult> {
    const { projectId, fileId } = params;

    return this.prisma.$transaction(async (tx) => {
      const file = await tx.projectFile.findFirst({
        where: { id: fileId, projectId, deletedAt: null },
      });

      if (!file) {
        throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'File or folder not found.');
      }

      let subtreeIds: string[] = [file.id];

      if (file.nodeType === 'FOLDER') {
        const descendants = await tx.projectFile.findMany({
          where: {
            projectId,
            path: { startsWith: `${file.path}/` },
            deletedAt: null,
          },
          select: { id: true },
        });
        subtreeIds = [file.id, ...descendants.map((d) => d.id)];
      }

      // Check for active AI proposals on documents in subtree
      const activeProposal = await tx.aIProposal.findFirst({
        where: {
          document: {
            fileId: { in: subtreeIds },
          },
          status: { in: ['QUEUED', 'GENERATING', 'PENDING'] },
        },
      });

      if (activeProposal) {
        throw new AppError(
          ErrorCodeEnum.PENDING_PROPOSAL,
          409,
          'Cannot delete file or folder because an active AI proposal is targeting a document in this subtree.',
        );
      }

      const now = new Date();

      // Soft delete all nodes in subtree
      await tx.projectFile.updateMany({
        where: { id: { in: subtreeIds } },
        data: { deletedAt: now },
      });

      // Check if project mainFileId was in subtree
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { mainFileId: true },
      });

      let mainFileCleared = false;
      if (project?.mainFileId && subtreeIds.includes(project.mainFileId)) {
        await tx.project.update({
          where: { id: projectId },
          data: { mainFileId: null, updatedAt: now },
        });
        mainFileCleared = true;
      }

      return {
        mainFileCleared,
        subtreeIds,
      };
    });
  }

  public async restoreFile(params: {
    projectId: string;
    fileId: string;
  }): Promise<ProjectFileDTO> {
    const { projectId, fileId } = params;

    return this.prisma.$transaction(async (tx) => {
      const file = await tx.projectFile.findFirst({
        where: { id: fileId, projectId, deletedAt: { not: null } },
      });

      if (!file) {
        throw new AppError(ErrorCodeEnum.NOT_FOUND, 404, 'Deleted file or folder not found.');
      }

      // Check if active file already occupies path
      const conflict = await tx.projectFile.findFirst({
        where: { projectId, path: file.path, deletedAt: null },
      });

      if (conflict) {
        throw new AppError(
          ErrorCodeEnum.NAME_TAKEN,
          409,
          `Cannot restore: an active file already exists at "${file.path}".`,
        );
      }

      const now = new Date();

      // Restore target node
      const restored = await tx.projectFile.update({
        where: { id: file.id },
        data: { deletedAt: null, updatedAt: now },
        include: {
          document: { select: { id: true, revision: true } },
          asset: { select: { id: true } },
        },
      });

      // If folder, restore descendants that were deleted at the same time
      if (file.nodeType === 'FOLDER' && file.deletedAt) {
        await tx.projectFile.updateMany({
          where: {
            projectId,
            path: { startsWith: `${file.path}/` },
            deletedAt: file.deletedAt,
          },
          data: { deletedAt: null, updatedAt: now },
        });
      }

      return {
        id: restored.id,
        parentId: restored.parentId,
        name: restored.name,
        path: restored.path,
        nodeType: restored.nodeType,
        kind: restored.kind,
        sizeBytes: Number(restored.sizeBytes),
        mimeType: restored.mimeType,
        ...(restored.document ? { documentId: restored.document.id, revision: restored.document.revision } : {}),
        ...(restored.asset ? { assetId: restored.asset.id } : {}),
        updatedAt: restored.updatedAt.toISOString(),
      };
    });
  }

  public async setMainFile(projectId: string, fileId: string): Promise<void> {
    const file = await this.prisma.projectFile.findFirst({
      where: {
        id: fileId,
        projectId,
        deletedAt: null,
      },
    });

    if (!file || file.kind !== 'TEXT' || !file.name.endsWith('.tex')) {
      throw new AppError(
        ErrorCodeEnum.INVALID_MAIN_FILE,
        422,
        'Main file must be an active .tex text document within the project.',
      );
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        mainFileId: file.id,
        updatedAt: new Date(),
      },
    });
  }
}

