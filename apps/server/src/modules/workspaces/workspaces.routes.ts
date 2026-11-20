import { Router, type RequestHandler } from 'express';
import type { WorkspacesController } from './workspaces.controller.js';
import { CreateWorkspaceRequestSchema, ErrorCodeEnum } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';

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

  router.post('/', (req, res, next) => {
    const parseResult = CreateWorkspaceRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(
        new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'Invalid workspace payload', {
          fields: parseResult.error.flatten().fieldErrors,
        }),
      );
    }
    req.body = parseResult.data;
    return options.controller.createWorkspace(req, res, next);
  });

  return router;
}
