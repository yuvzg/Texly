import { createHash } from 'node:crypto';
import type {
  PrismaClient,
  Project,
  ProjectMember,
  LatexEngine,
  BibTool,
  ProjectRole,
} from '@texly/db';
import type { ProjectDTO, ProjectTemplate, Engine } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';
import { getTemplateFiles } from './templates.js';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export interface CreateProjectParams {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string | undefined;
  template?: ProjectTemplate | undefined;
  engine?: Engine | undefined;
}

export interface ListProjectsOptions {
  workspaceId?: string | undefined;
  trashed?: boolean | undefined;
  query?: string | undefined;
}

export class ProjectsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async createProject(params: CreateProjectParams): Promise<ProjectDTO> {
    const {
      workspaceId,
      userId,
      name,
      description,
      template = 'blank',
      engine = 'PDFLATEX',
    } = params;

    // Verify workspace exists and user is a member
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        workspace: {
          deletedAt: null,
        },
      },
      include: {
        workspace: {
          include: {
            subscription: true,
          },
        },
      },
    });

    if (!membership) {
      throw new AppError(ErrorCodeEnum.FORBIDDEN, 403, 'You do not have access to this workspace.');
    }

    // Check project quota based on plan
    const plan = membership.workspace.subscription?.plan ?? 'FREE';
    const maxProjects = plan === 'TEAM' ? 1000 : plan === 'PRO' ? 100 : 25;

    const currentProjectCount = await this.prisma.project.count({
      where: {
        workspaceId,
        trashedAt: null,
      },
    });

    if (currentProjectCount >= maxProjects) {
      throw new AppError(
        ErrorCodeEnum.PROJECT_LIMIT_REACHED,
        409,
        `Project limit of ${maxProjects} reached for workspace on ${plan} plan.`,
      );
    }

    // Generate template files
    const templateFiles = getTemplateFiles(template, name);
    let totalStorageBytes = 0;
    for (const f of templateFiles) {
      totalStorageBytes += Buffer.byteLength(f.content, 'utf8');
    }

    // Atomic transaction for project, membership, files, and documents
    const createdProject = await this.prisma.$transaction(async (tx) => {
      // 1. Insert Project
      const project = await tx.project.create({
        data: {
          workspaceId,
          createdById: userId,
          name,
          description: description ?? null,
          engine: engine as LatexEngine,
          bibTool: 'AUTO' as BibTool,
          autoCompile: false,
          storageBytes: BigInt(totalStorageBytes),
          templateKey: template,
        },
      });

      // 2. Insert ProjectMember (OWNER)
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId,
          role: 'OWNER' as ProjectRole,
          lastOpenedAt: new Date(),
        },
      });

      // 3. Insert Template Files and Documents
      let mainFileId: string | null = null;

      for (const fileSpec of templateFiles) {
        const fileBytes = Buffer.byteLength(fileSpec.content, 'utf8');
        const hash = sha256(fileSpec.content);

        const projectFile = await tx.projectFile.create({
          data: {
            projectId: project.id,
            name: fileSpec.name,
            path: fileSpec.path,
            nodeType: 'FILE',
            kind: 'TEXT',
            mimeType: fileSpec.mimeType,
            sizeBytes: BigInt(fileBytes),
            createdById: userId,
          },
        });

        await tx.document.create({
          data: {
            fileId: projectFile.id,
            projectId: project.id,
            content: fileSpec.content,
            contentHash: hash,
            revision: 1,
            sizeBytes: fileBytes,
            updatedById: userId,
          },
        });

        if (fileSpec.isMain) {
          mainFileId = projectFile.id;
        }
      }

      // 4. Update mainFileId
      if (mainFileId) {
        await tx.project.update({
          where: { id: project.id },
          data: { mainFileId },
        });
      }

      return {
        ...project,
        mainFileId,
        role: 'OWNER' as ProjectRole,
      };
    });

    return this.mapToDTO(createdProject, 'OWNER');
  }

  public async findProjectsByUser(
    userId: string,
    options: ListProjectsOptions = {},
  ): Promise<ProjectDTO[]> {
    const { workspaceId, trashed = false, query } = options;

    const memberProjects = await this.prisma.projectMember.findMany({
      where: {
        userId,
        project: {
          ...(workspaceId ? { workspaceId } : {}),
          ...(trashed ? { trashedAt: { not: null } } : { trashedAt: null }),
          ...(query
            ? {
                name: {
                  contains: query,
                  mode: 'insensitive',
                },
              }
            : {}),
        },
      },
      include: {
        project: true,
      },
      orderBy: {
        project: {
          updatedAt: 'desc',
        },
      },
    });

    return memberProjects.map((mp) => this.mapToDTO(mp.project, mp.role));
  }

  public async updateProject(
    projectId: string,
    userId: string,
    data: {
      name?: string | undefined;
      description?: string | null | undefined;
      engine?: Engine | undefined;
      bibTool?: BibTool | undefined;
      mainFileId?: string | null | undefined;
      autoCompile?: boolean | undefined;
    },
  ): Promise<ProjectDTO> {
    const memberProject = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
      },
    });

    if (!memberProject || (memberProject.role !== 'OWNER' && memberProject.role !== 'EDITOR')) {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'You do not have permission to modify this project.',
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.description !== undefined) updateData['description'] = data.description;
    if (data.engine !== undefined) updateData['engine'] = data.engine;
    if (data.bibTool !== undefined) updateData['bibTool'] = data.bibTool;
    if (data.mainFileId !== undefined) {
      if (data.mainFileId !== null) {
        const file = await this.prisma.projectFile.findFirst({
          where: {
            id: data.mainFileId,
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
      }
      updateData['mainFileId'] = data.mainFileId;
    }
    if (data.autoCompile !== undefined) updateData['autoCompile'] = data.autoCompile;

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });

    return this.mapToDTO(updated, memberProject.role);
  }

  public async findProjectById(projectId: string, userId: string): Promise<ProjectDTO | null> {
    const memberProject = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
      },
      include: {
        project: true,
      },
    });

    if (!memberProject) {
      return null;
    }

    return this.mapToDTO(memberProject.project, memberProject.role);
  }

  public async deleteProject(projectId: string, userId: string): Promise<void> {
    const memberProject = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
      },
    });

    if (!memberProject || memberProject.role !== 'OWNER') {
      throw new AppError(
        ErrorCodeEnum.FORBIDDEN,
        403,
        'Only project owners can delete this project.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.project.update({
        where: { id: projectId },
        data: {
          trashedAt: new Date(),
        },
      }),
      this.prisma.compilation.updateMany({
        where: {
          projectId,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        data: {
          status: 'CANCELLED',
          finishedAt: new Date(),
        },
      }),
    ]);
  }

  private mapToDTO(project: Project, role?: ProjectRole): ProjectDTO {
    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description ?? null,
      engine: project.engine as Engine,
      bibTool: project.bibTool as ProjectDTO['bibTool'],
      mainFileId: project.mainFileId ?? null,
      autoCompile: project.autoCompile,
      role: role as ProjectDTO['role'],
      storageBytes: Number(project.storageBytes),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      trashedAt: project.trashedAt?.toISOString() ?? null,
    };
  }
}
