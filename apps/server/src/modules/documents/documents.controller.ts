import type { Request, Response, NextFunction } from 'express';
import type { DocumentsService } from './documents.service.js';
import type { PutDocumentContentRequest } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';

export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  public getDocument = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const rawProjectId = req.params['projectId'];
      const rawDocumentId = req.params['documentId'];
      const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
      const documentId = Array.isArray(rawDocumentId) ? rawDocumentId[0] : rawDocumentId;

      if (!projectId || !documentId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'Missing projectId or documentId');
      }

      const document = await this.documentsService.getDocument(projectId, documentId, userId);
      res.status(200).json({
        data: document,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getMainDocument = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const rawProjectId = req.params['projectId'];
      const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
      if (!projectId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'Missing projectId');
      }

      const document = await this.documentsService.getMainDocument(projectId, userId);
      res.status(200).json({
        data: document,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public saveContent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const rawProjectId = req.params['projectId'];
      const rawDocumentId = req.params['documentId'];
      const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
      const documentId = Array.isArray(rawDocumentId) ? rawDocumentId[0] : rawDocumentId;

      if (!projectId || !documentId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'Missing projectId or documentId');
      }

      const body = req.body as PutDocumentContentRequest;
      const result = await this.documentsService.saveDocumentContent(
        projectId,
        documentId,
        userId,
        body,
      );

      res.status(200).json({
        data: result,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

