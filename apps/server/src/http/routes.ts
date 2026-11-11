import { Router } from 'express';
import type { Request, Response } from 'express';
import { checkDbHealth } from '@texly/db';

export function createApiRouter(): Router {
  const router = Router();

  // Standard health check
  router.get('/health', (_req: Request, res: Response) => {
    const requestId = _req.id ?? 'unknown';
    res.status(200).json({
      data: {
        status: 'ok',
        version: '0.1.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Readiness probe verifying critical dependencies
  router.get('/ready', (_req: Request, res: Response) => {
    const db = checkDbHealth();
    const isReady = db.connected;
    const requestId = _req.id ?? 'unknown';

    const statusCode = isReady ? 200 : 503;
    res.status(statusCode).json({
      data: {
        status: isReady ? 'ready' : 'not_ready',
        checks: {
          database: db,
        },
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}

