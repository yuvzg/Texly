import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

export function startWorker() {
  const workerLogger = logger.child({ service: 'server-worker' });
  workerLogger.info({ env: env.NODE_ENV }, 'Server background worker started');

  const shutdown = (signal: string) => {
    workerLogger.info({ signal }, 'Stopping worker gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env['NODE_ENV'] !== 'test') {
  startWorker();
}
