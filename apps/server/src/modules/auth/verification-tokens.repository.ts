import type { PrismaClient, VerificationToken, TokenType } from '@texly/db';
import type { DbClient } from './types.js';

export interface CreateVerificationTokenData {
  id?: string;
  userId: string;
  type: TokenType;
  tokenHash: string;
  expiresAt: Date;
}

export class VerificationTokensRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DbClient): DbClient {
    return tx ?? this.prisma;
  }

  async findById(id: string, tx?: DbClient): Promise<VerificationToken | null> {
    return this.getClient(tx).verificationToken.findUnique({
      where: { id },
    });
  }

  async findByTokenHash(
    tokenHash: string,
    type?: TokenType,
    tx?: DbClient,
  ): Promise<VerificationToken | null> {
    const token = await this.getClient(tx).verificationToken.findUnique({
      where: { tokenHash },
    });

    if (!token) return null;
    if (type && token.type !== type) return null;

    return token;
  }

  async create(data: CreateVerificationTokenData, tx?: DbClient): Promise<VerificationToken> {
    return this.getClient(tx).verificationToken.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        userId: data.userId,
        type: data.type,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  async markUsed(id: string, usedAt: Date = new Date(), tx?: DbClient): Promise<VerificationToken> {
    return this.getClient(tx).verificationToken.update({
      where: { id },
      data: {
        usedAt,
      },
    });
  }

  async revokePendingForUser(
    userId: string,
    type: TokenType,
    now: Date = new Date(),
    tx?: DbClient,
  ): Promise<number> {
    const result = await this.getClient(tx).verificationToken.updateMany({
      where: {
        userId,
        type,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });
    return result.count;
  }

  async deleteExpired(now: Date = new Date(), tx?: DbClient): Promise<number> {
    const result = await this.getClient(tx).verificationToken.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });
    return result.count;
  }
}
