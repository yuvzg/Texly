import { Router, type RequestHandler } from 'express';
import type { CompilationsController } from './compilations.controller.js';

export interface CompilationsRouterOptions {
  controller: CompilationsController;
  authMiddleware: RequestHandler;
  originMiddleware?: RequestHandler;
}

export function createProjectCompilationsRouter(options: CompilationsRouterOptions): Router {
  const router = Router({ mergeParams: true });

  if (options.originMiddleware) {
    router.use(options.originMiddleware);
  }
  router.use(options.authMiddleware);

  // Note: /latest must come before general list if mounted at root of project compilations
  router.get('/latest', options.controller.getLatest);
  router.get('/', options.controller.list);
  router.post('/', options.controller.create);

  return router;
}

export function createCompilationsRouter(options: CompilationsRouterOptions): Router {
  const router = Router({ mergeParams: true });

  if (options.originMiddleware) {
    router.use(options.originMiddleware);
  }
  router.use(options.authMiddleware);

  router.get('/:compilationId', options.controller.getById);
  router.get('/:compilationId/log', options.controller.getLog);
  router.get('/:compilationId/pdf', options.controller.getPdf);
  router.delete('/:compilationId', options.controller.cancel);

  router.post('/:compilationId/synctex/forward', options.controller.syncTexForward);
  router.post('/:compilationId/synctex/inverse', options.controller.syncTexInverse);

  return router;
}
