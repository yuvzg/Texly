import type { PrismaClient, Session } from '@texly/db';
import type { DbClient } from './types.js';

export interface CreateSessionData {
  id?: string | undefined;
  userId: string;
  familyId: string;
  tokenHash: string;
  userAgent?: string | null | undefined;
  ipAddress?: string | null | undefined;
  expiresAt: Date;
}

export interface UpdateSessionData {
  lastUsedAt?: Date;
  revokedAt?: Date | null;
  replacedById?: string | null;
}

export class SessionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DbClient): DbClient {
    return tx ?? this.prisma;
  }

  async findById(id: string, tx?: DbClient): Promise<Session | null> {
    return this.getClient(tx).session.findUnique({
      where: { id },
    });
  }

  async findByTokenHash(tokenHash: string, tx?: DbClient): Promise<Session | null> {
    return this.getClient(tx).session.findUnique({
      where: { tokenHash },
    });
  }

  async create(data: CreateSessionData, tx?: DbClient): Promise<Session> {
    return this.getClient(tx).session.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        userId: data.userId,
        familyId: data.familyId,
        tokenHash: data.tokenHash,
        userAgent: data.userAgent ?? null,
        ipAddress: data.ipAddress ?? null,
        expiresAt: data.expiresAt,
      },
    });
  }

  async update(id: string, data: UpdateSessionData, tx?: DbClient): Promise<Session> {
    return this.getClient(tx).session.update({
      where: { id },
      data,
    });
  }

  async revoke(id: string, revokedAt: Date = new Date(), tx?: DbClient): Promise<Session> {
    return this.getClient(tx).session.update({
      where: { id },
      data: {
        revokedAt,
      },
    });
  }

  async revokeFamily(
    familyId: string,
    revokedAt: Date = new Date(),
    tx?: DbClient,
  ): Promise<number> {
    const result = await this.getClient(tx).session.updateMany({
      where: {
        familyId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
    return result.count;
  }

  async revokeAllForUser(
    userId: string,
    revokedAt: Date = new Date(),
    tx?: DbClient,
  ): Promise<number> {
    const result = await this.getClient(tx).session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
    return result.count;
  }

  async countActiveForUser(userId: string, now: Date = new Date(), tx?: DbClient): Promise<number> {
    return this.getClient(tx).session.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    });
  }

  /**
   * Enforces max concurrent active sessions per user by revoking the oldest active sessions.
   */
  async pruneOldestForUser(
    userId: string,
    keepCount: number,
    now: Date = new Date(),
    tx?: DbClient,
  ): Promise<number> {
    const client = this.getClient(tx);
    const activeSessions = await client.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
      },
    });

    if (activeSessions.length <= keepCount) {
      return 0;
    }

    const toRevokeIds = activeSessions.slice(keepCount).map((s: { id: string }) => s.id);
    const result = await client.session.updateMany({
      where: {
        id: {
          in: toRevokeIds,
        },
      },
      data: {
        revokedAt: now,
      },
    });

    return result.count;
  }
}
