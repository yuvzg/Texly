import { createApp } from '../http/app.js';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

export function startApiServer() {
  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, 'API server started');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing API server gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (process.env['NODE_ENV'] !== 'test') {
  startApiServer();
}
