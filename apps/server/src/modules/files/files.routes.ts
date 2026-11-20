import { Router, type RequestHandler } from 'express';
import type { FilesController } from './files.controller.js';

export interface FilesRouterOptions {
  controller: FilesController;
  authMiddleware: RequestHandler;
  originMiddleware?: RequestHandler;
}

export function createFilesRouter(options: FilesRouterOptions): Router {
  const router = Router({ mergeParams: true });

  if (options.originMiddleware) {
    router.use(options.originMiddleware);
  }
  router.use(options.authMiddleware);

  // File tree and creation
  router.get('/', options.controller.listFiles);
  router.post('/', options.controller.createFile);

  // Main file setting
  router.post('/main', options.controller.setMainFile);
  router.post('/:fileId/set-main', options.controller.setMainFile);

  // Individual file actions
  router.get('/:fileId', options.controller.getFile);
  router.patch('/:fileId', options.controller.updateFile);
  router.delete('/:fileId', options.controller.deleteFile);
  router.post('/:fileId/restore', options.controller.restoreFile);

  return router;
}

