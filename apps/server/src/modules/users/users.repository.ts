import type { PrismaClient, User } from '@texly/db';
import type { DbClient } from '../auth/types.js';

export interface CreateUserData {
  id?: string;
  email: string;
  name: string;
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
}

export interface UpdateUserData {
  name?: string;
  passwordHash?: string | null;
  avatarKey?: string | null;
  emailVerifiedAt?: Date | null;
  disabledAt?: Date | null;
  lastLoginAt?: Date | null;
  deletedAt?: Date | null;
}

export class UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DbClient): DbClient {
    return tx ?? this.prisma;
  }

  async findById(id: string, tx?: DbClient): Promise<User | null> {
    return this.getClient(tx).user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string, tx?: DbClient): Promise<User | null> {
    return this.getClient(tx).user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async create(data: CreateUserData, tx?: DbClient): Promise<User> {
    return this.getClient(tx).user.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        email: data.email.toLowerCase().trim(),
        name: data.name.trim(),
        passwordHash: data.passwordHash ?? null,
        emailVerifiedAt: data.emailVerifiedAt ?? null,
      },
    });
  }

  async update(id: string, data: UpdateUserData, tx?: DbClient): Promise<User> {
    return this.getClient(tx).user.update({
      where: { id },
      data,
    });
  }

  async updateLastLogin(id: string, tx?: DbClient): Promise<User> {
    return this.getClient(tx).user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async markEmailVerified(id: string, verifiedAt: Date = new Date(), tx?: DbClient): Promise<User> {
    return this.getClient(tx).user.update({
      where: { id },
      data: {
        emailVerifiedAt: verifiedAt,
      },
    });
  }
}
