import type { PrismaClient, TransactionClient } from '@texly/db';

export type DbClient = PrismaClient | TransactionClient;
