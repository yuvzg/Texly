import { Router } from 'express';
import type { Request, Response } from 'express';
import { checkDbHealth } from '@texly/db';
import type { AppContainer } from '../container.js';

export function createApiRouter(container: AppContainer): Router {
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

  // Mount API modules
  router.use('/auth', container.authRouter);
  router.use('/users', container.usersRouter);
  router.use('/workspaces', container.workspacesRouter);
  router.use('/projects/:projectId/documents', container.documentsRouter);
  router.use('/projects/:projectId/compilations', container.projectCompilationsRouter);
  router.use('/projects', container.projectsRouter);
  router.use('/compilations', container.compilationsRouter);

  return router;
}
