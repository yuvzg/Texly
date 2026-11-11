import type { PrismaClient, Workspace, WorkspaceRole, Plan } from '@texly/db';
import type { DbClient } from '../auth/types.js';

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
}
