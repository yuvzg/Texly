import http from 'node:http';
import { createApp } from '../http/app.js';
import { buildContainer } from '../container.js';
import { setupSocketServer } from '../realtime/socket-server.js';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

export function startApiServer() {
  const container = buildContainer();
  const app = createApp({ container });
  const httpServer = http.createServer(app);

  setupSocketServer({
    httpServer,
    jwtService: container.jwtService,
    realtimeEmitter: container.realtimeEmitter,
    documentsRepository: container.documentsRepo,
    prisma: container.db.client,
    redisUrl: env.REDIS_URL,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
  });

  if (env.NODE_ENV === 'development') {
    container.compilationsWorker.start();
    container.compilationsReconciler.start();
  }

  const server = httpServer.listen(env.PORT, env.HOST, () => {
    logger.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, 'API server started');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing API server gracefully');
    if (env.NODE_ENV === 'development') {
      container.compilationsReconciler.stop();
      void container.compilationsWorker.close();
    }
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
