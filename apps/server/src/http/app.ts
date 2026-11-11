import express from 'express';
import type { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes.js';
import { checkDbHealth } from '@texly/db';
import { buildContainer, type ContainerDependencies, type AppContainer } from '../container.js';

export interface CreateAppOptions {
  container?: AppContainer;
  dependencies?: ContainerDependencies;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const container = options.container ?? buildContainer(options.dependencies);
  const app = express();

  app.disable('x-powered-by');

  // Security headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // API server: web app serves its own CSP
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Exact CORS allowlist
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) {
          callback(null, true);
          return;
        }
        if (container.env.CORS_ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    }),
  );

  // Parse cookies and JSON bodies
  app.use(cookieParser());
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
  app.use('/api/v1', createApiRouter(container));

  // Global error handler must be last
  app.use(errorHandler);

  return app;
}
