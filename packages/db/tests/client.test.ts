import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, type TestDatabase } from './helper.js';
import { checkDatabaseHealth } from '../src/health.js';
import { withTransaction } from '../src/transaction.js';

describe('Database Client & Health', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await setupTestDatabase();
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.cleanup();
    }
  });

  it('reports database health as ok with measured latency', async () => {
    const health = await checkDatabaseHealth(db.client);
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.timestamp).toBeDefined();
    expect(health.error).toBeUndefined();
  });

  it('executes successful transactions atomically', async () => {
    const user = await withTransaction(db.client, async (tx) => {
      return tx.user.create({
        data: {
          email: 'tx-success@texly.app',
          name: 'Transaction User',
        },
      });
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('tx-success@texly.app');

    const found = await db.client.user.findUnique({ where: { id: user.id } });
    expect(found).not.toBeNull();
  });

  it('rolls back database modifications when a transaction fails', async () => {
    const targetEmail = 'rollback-test@texly.app';

    await expect(
      withTransaction(db.client, async (tx) => {
        await tx.user.create({
          data: {
            email: targetEmail,
            name: 'Will Roll Back',
          },
        });
        throw new Error('Simulated failure during transaction');
      }),
    ).rejects.toThrow('Simulated failure during transaction');

    const found = await db.client.user.findUnique({ where: { email: targetEmail } });
    expect(found).toBeNull();
  });
});
