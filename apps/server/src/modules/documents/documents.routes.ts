import { Router, type RequestHandler } from 'express';
import type { DocumentsController } from './documents.controller.js';
import { PutDocumentContentRequestSchema, ErrorCodeEnum } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';

export interface DocumentsRouterOptions {
  controller: DocumentsController;
  authMiddleware: RequestHandler;
  originMiddleware?: RequestHandler;
}

export function createDocumentsRouter(options: DocumentsRouterOptions): Router {
  const router = Router({ mergeParams: true });

  if (options.originMiddleware) {
    router.use(options.originMiddleware);
  }
  router.use(options.authMiddleware);

  router.get('/main', options.controller.getMainDocument);
  router.get('/:documentId', options.controller.getDocument);

  router.put('/:documentId/content', (req, res, next) => {
    const parseResult = PutDocumentContentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(
        new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'Invalid document content request', {
          fields: parseResult.error.flatten().fieldErrors,
        }),
      );
    }
    req.body = parseResult.data;
    return options.controller.saveContent(req, res, next);
  });

  return router;
}
