import type { Request, Response, NextFunction } from 'express';
import type { FilesService } from './files.service.js';
import { CreateFileRequestSchema, UpdateFileRequestSchema, ErrorCodeEnum } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';

export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  public listFiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params as { projectId: string };
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Unauthorized');
      }

      const result = await this.filesService.listFiles(projectId, userId);
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

  public getFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId, fileId } = req.params as { projectId: string; fileId: string };
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Unauthorized');
      }

      const file = await this.filesService.getFile(projectId, fileId, userId);
      res.status(200).json({
        data: file,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public createFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params as { projectId: string };
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Unauthorized');
      }

      const parseResult = CreateFileRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'Invalid file creation payload.', {
          fields: parseResult.error.flatten().fieldErrors,
        });
      }

      const { nodeType, parentId, name, content } = parseResult.data;

      if (nodeType === 'FOLDER') {
        const folder = await this.filesService.createFolder({
          projectId,
          parentId: parentId ?? null,
          name,
          userId,
        });
        res.status(201).json({
          data: folder,
          meta: {
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        const file = await this.filesService.createTextFile({
          projectId,
          parentId: parentId ?? null,
          name,
          content,
          userId,
        });
        res.status(201).json({
          data: file,
          meta: {
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (err) {
      next(err);
    }
  };

  public updateFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId, fileId } = req.params as { projectId: string; fileId: string };
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Unauthorized');
      }

      const parseResult = UpdateFileRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'Invalid file update payload.', {
          fields: parseResult.error.flatten().fieldErrors,
        });
      }

      const { name, parentId } = parseResult.data;
      const result = await this.filesService.updateFile({
        projectId,
        fileId,
        name,
        parentId,
        userId,
      });

      res.status(200).json({
        data: result.file,
        affected: result.affected,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public deleteFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId, fileId } = req.params as { projectId: string; fileId: string };
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Unauthorized');
      }

      const result = await this.filesService.deleteFile({
        projectId,
        fileId,
        userId,
      });

      if (result.mainFileCleared) {
        res.setHeader('X-Main-File-Cleared', 'true');
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  public restoreFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId, fileId } = req.params as { projectId: string; fileId: string };
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Unauthorized');
      }

      const file = await this.filesService.restoreFile({
        projectId,
        fileId,
        userId,
      });

      res.status(200).json({
        data: file,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public setMainFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params as { projectId: string };
      const fileId = (req.params as { fileId?: string }).fileId ?? (req.body as { fileId?: string }).fileId;
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Unauthorized');
      }

      if (!fileId) {
        throw new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'fileId is required.');
      }

      await this.filesService.setMainFile({
        projectId,
        fileId,
        userId,
      });

      res.status(200).json({
        data: { success: true },
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

