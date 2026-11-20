import type { Request, Response, NextFunction } from 'express';
import type { WorkspacesRepository } from './workspaces.repository.js';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';

export class WorkspacesController {
  constructor(private readonly workspacesRepository: WorkspacesRepository) {}

  public listWorkspaces = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const workspaces = await this.workspacesRepository.findWorkspacesWithUsage(userId);

      res.status(200).json({
        data: workspaces,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public createWorkspace = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const workspace = await this.workspacesRepository.createWorkspace(userId, req.body);

      res.status(201).json({
        data: workspace,
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
