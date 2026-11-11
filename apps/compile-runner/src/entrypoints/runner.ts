import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

export function startRunner() {
  logger.info(
    {
      concurrency: env.COMPILE_CONCURRENCY,
      timeoutMs: env.COMPILE_TIMEOUT_MS,
      env: env.NODE_ENV,
    },
    'Compile runner service bootstrapped successfully',
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Stopping compile runner gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env['NODE_ENV'] !== 'test') {
  startRunner();
}

