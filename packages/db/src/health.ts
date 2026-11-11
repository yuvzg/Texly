import type { PrismaClient } from './generated/prisma/client.js';

export interface DatabaseHealthResult {
  ok: boolean;
  latencyMs: number;
  timestamp: string;
  error?: string;
}

export interface LegacyDbHealth {
  connected: boolean;
  status: string;
}

export function checkDbHealth(): LegacyDbHealth {
  return {
    connected: true,
    status: 'connected',
  };
}

export async function checkDatabaseHealth(client: PrismaClient): Promise<DatabaseHealthResult> {
  const start = Date.now();
  try {
    await client.$queryRawUnsafe('SELECT 1');
    const latencyMs = Date.now() - start;
    return {
      ok: true,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      latencyMs,
      timestamp: new Date().toISOString(),
      error: errorMessage,
    };
  }
}
