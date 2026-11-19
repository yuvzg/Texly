import { Router, type RequestHandler } from 'express';
import type { WorkspacesController } from './workspaces.controller.js';

export interface WorkspacesRouterOptions {
  controller: WorkspacesController;
  authMiddleware: RequestHandler;
  originMiddleware?: RequestHandler | undefined;
}

export function createWorkspacesRouter(options: WorkspacesRouterOptions): Router {
  const router = Router();

  if (options.originMiddleware) {
    router.use(options.originMiddleware);
  }
  router.use(options.authMiddleware);

  router.get('/', options.controller.listWorkspaces);

  return router;
}
