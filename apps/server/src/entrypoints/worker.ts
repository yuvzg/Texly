import { buildContainer } from '../container.js';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

export function startWorker() {
  const workerLogger = logger.child({ service: 'server-worker' });
  workerLogger.info({ env: env.NODE_ENV }, 'Server background worker started');

  const container = buildContainer();
  container.compilationsWorker.start();
  container.compilationsReconciler.start();

  const shutdown = async (signal: string) => {
    workerLogger.info({ signal }, 'Stopping worker gracefully');
    container.compilationsReconciler.stop();
    await container.compilationsWorker.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

if (process.env['NODE_ENV'] !== 'test') {
  startWorker();
}
