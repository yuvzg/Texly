import { Router, type RequestHandler } from 'express';
import type { ProjectsController } from './projects.controller.js';
import {
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  ErrorCodeEnum,
} from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';

export interface ProjectsRouterOptions {
  controller: ProjectsController;
  authMiddleware: RequestHandler;
  originMiddleware?: RequestHandler | undefined;
}

export function createProjectsRouter(options: ProjectsRouterOptions): Router {
  const router = Router();

  if (options.originMiddleware) {
    router.use(options.originMiddleware);
  }
  router.use(options.authMiddleware);

  // POST /projects - create project in workspace
  router.post('/', (req, res, next) => {
    const parseResult = CreateProjectRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(
        new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'Invalid create project request', {
          fields: parseResult.error.flatten().fieldErrors,
        }),
      );
    }
    req.body = parseResult.data;
    return options.controller.createProject(req, res, next);
  });

  // GET /projects - list user's projects
  router.get('/', options.controller.listProjects);

  // GET /projects/:projectId - get project details
  router.get('/:projectId', options.controller.getProject);

  // PATCH /projects/:projectId - update project settings
  router.patch('/:projectId', (req, res, next) => {
    const parseResult = UpdateProjectRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(
        new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'Invalid update project request', {
          fields: parseResult.error.flatten().fieldErrors,
        }),
      );
    }
    req.body = parseResult.data;
    return options.controller.updateProject(req, res, next);
  });

  // DELETE /projects/:projectId - delete project (move to trash)
  router.delete('/:projectId', options.controller.deleteProject);

  return router;
}
