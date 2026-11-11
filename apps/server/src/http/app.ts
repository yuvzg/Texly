import express from 'express';
import type { Express, Request, Response } from 'express';
import { requestIdMiddleware } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes.js';
import { checkDbHealth } from '@texly/db';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);

  // Top-level liveness and readiness probes for orchestrators (Kubernetes / ECS / ALB)
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/readyz', (_req: Request, res: Response) => {
    const db = checkDbHealth();
    if (db.connected) {
      res.status(200).json({ status: 'ready', checks: { database: db } });
    } else {
      res.status(503).json({ status: 'not_ready', checks: { database: db } });
    }
  });

  // API v1 router
  app.use('/api/v1', createApiRouter());

  // Global error handler must be last
  app.use(errorHandler);

  return app;
}
