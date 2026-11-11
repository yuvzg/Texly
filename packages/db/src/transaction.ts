import type { Prisma, PrismaClient } from './generated/prisma/client.js';

export type TransactionClient = Prisma.TransactionClient;

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

export async function withTransaction<T>(
  client: PrismaClient,
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return client.$transaction(fn, {
    maxWait: options?.maxWait ?? 5000,
    timeout: options?.timeout ?? 10000,
    ...(options?.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
  });
}
