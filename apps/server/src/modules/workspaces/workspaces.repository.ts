import type { PrismaClient, Workspace, WorkspaceRole, Plan } from '@texly/db';
import type { DbClient } from '../auth/types.js';
import type { WorkspaceWithRoleDTO } from '@texly/shared';

export interface UserWorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  isPersonal: boolean;
  plan: Plan;
}

export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DbClient): DbClient {
    return tx ?? this.prisma;
  }

  async findUserWorkspaces(userId: string, tx?: DbClient): Promise<UserWorkspaceSummary[]> {
    const members = await this.getClient(tx).workspaceMember.findMany({
      where: {
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
      orderBy: {
        createdAt: 'asc',
      },
    });

    return members.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
      isPersonal: m.workspace.isPersonal,
      plan: m.workspace.subscription?.plan ?? ('FREE' as Plan),
    }));
  }

  async findPersonalWorkspace(userId: string, tx?: DbClient): Promise<Workspace | null> {
    const member = await this.getClient(tx).workspaceMember.findFirst({
      where: {
        userId,
        workspace: {
          isPersonal: true,
          deletedAt: null,
        },
      },
      include: {
        workspace: true,
      },
    });

    return member?.workspace ?? null;
  }

  async findWorkspacesWithUsage(userId: string): Promise<WorkspaceWithRoleDTO[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: {
        userId,
        workspace: {
          deletedAt: null,
        },
      },
      include: {
        workspace: {
          include: {
            projects: {
              where: { trashedAt: null },
              select: { storageBytes: true },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return members.map((m) => {
      let totalStorageBytes = 0;
      for (const p of m.workspace.projects) {
        totalStorageBytes += Number(p.storageBytes);
      }
      return {
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role as WorkspaceWithRoleDTO['role'],
        isPersonal: m.workspace.isPersonal,
        usage: {
          storageBytes: totalStorageBytes,
          quota: 50 * 1024 * 1024,
        },
      };
    });
  }

  async createWorkspace(
    userId: string,
    input: { name: string; slug?: string },
  ): Promise<WorkspaceWithRoleDTO> {
    const rawSlug =
      input.slug ||
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    let slug = rawSlug || 'workspace';

    // Ensure unique slug
    let attempt = 0;
    while (true) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
      const existing = await this.prisma.workspace.findUnique({ where: { slug: candidate } });
      if (!existing) {
        slug = candidate;
        break;
      }
      attempt++;
    }

    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: input.name.trim(),
          slug,
          isPersonal: false,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: 'OWNER',
        },
      });

      await tx.subscription.create({
        data: {
          workspaceId: workspace.id,
          plan: 'FREE',
          status: 'ACTIVE',
        },
      });

      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: 'OWNER',
        isPersonal: false,
        usage: {
          storageBytes: 0,
          quota: 50 * 1024 * 1024,
        },
      };
    });
  }
}
