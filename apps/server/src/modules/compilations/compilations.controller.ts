import type { Request, Response, NextFunction } from 'express';
import {
  CreateCompilationRequestSchema,
  SyncTexForwardRequestSchema,
  SyncTexInverseRequestSchema,
  ErrorCodeEnum,
  type CompilationStatus,
} from '@texly/shared';
import type { CompilationsService } from './compilations.service.js';
import { AppError } from '../../http/middleware/error-handler.js';

function getParam(param: string | string[] | undefined): string | undefined {
  if (!param) return undefined;
  return Array.isArray(param) ? param[0] : param;
}

export class CompilationsController {
  constructor(private readonly compilationsService: CompilationsService) {}

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const projectId = getParam(req.params['projectId']);
      if (!projectId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'projectId is required');
      }

      const parsedBody = CreateCompilationRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Invalid compilation request parameters',
        );
      }

      const result = await this.compilationsService.createCompilation(
        userId,
        projectId,
        parsedBody.data,
      );

      const statusCode = result.cacheHit ? 201 : 202;
      res.status(statusCode).json({
        data: result.compilation,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const projectId = getParam(req.params['projectId']);
      if (!projectId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'projectId is required');
      }

      const limit = req.query['limit'] ? Number(req.query['limit']) : 25;
      const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
      const status =
        typeof req.query['status'] === 'string'
          ? (req.query['status'] as CompilationStatus)
          : undefined;

      const result = await this.compilationsService.listCompilations(userId, projectId, {
        limit,
        cursor,
        status,
      });

      res.status(200).json({
        data: result.items,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getLatest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const projectId = getParam(req.params['projectId']);
      if (!projectId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'projectId is required');
      }

      const compilation = await this.compilationsService.getLatestCompilation(userId, projectId);

      res.status(200).json({
        data: compilation,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const compilationId = getParam(req.params['compilationId']);
      if (!compilationId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'compilationId is required');
      }

      const compilation = await this.compilationsService.getCompilation(userId, compilationId);

      res.status(200).json({
        data: compilation,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const compilationId = getParam(req.params['compilationId']);
      if (!compilationId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'compilationId is required');
      }

      const raw = req.query['raw'] === '1' || req.query['raw'] === 'true';

      const result = await this.compilationsService.getCompilationLog(userId, compilationId, raw);

      if (result.redirectUrl) {
        res.redirect(302, result.redirectUrl);
        return;
      }

      res.status(200).json({
        data: result.data,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const compilationId = getParam(req.params['compilationId']);
      if (!compilationId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'compilationId is required');
      }

      const download = req.query['download'] === '1' || req.query['download'] === 'true';

      const pdfData = await this.compilationsService.getCompilationPdf(
        userId,
        compilationId,
        download,
      );

      res.setHeader('Cache-Control', 'private, max-age=60');
      res.status(200).json({
        data: pdfData,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const compilationId = getParam(req.params['compilationId']);
      if (!compilationId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'compilationId is required');
      }

      const result = await this.compilationsService.cancelCompilation(userId, compilationId);

      res.status(202).json({
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

  public syncTexForward = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const compilationId = getParam(req.params['compilationId']);
      if (!compilationId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'compilationId is required');
      }

      const parsed = SyncTexForwardRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Invalid forward SyncTeX parameters',
        );
      }

      const result = await this.compilationsService.syncTexForward(
        userId,
        compilationId,
        parsed.data,
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

  public syncTexInverse = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const compilationId = getParam(req.params['compilationId']);
      if (!compilationId) {
        throw new AppError(ErrorCodeEnum.BAD_REQUEST, 400, 'compilationId is required');
      }

      const parsed = SyncTexInverseRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Invalid inverse SyncTeX parameters',
        );
      }

      const result = await this.compilationsService.syncTexInverse(
        userId,
        compilationId,
        parsed.data,
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
