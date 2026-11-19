import type { Request, Response, NextFunction } from 'express';
import type { ProjectsService } from './projects.service.js';
import type { CreateProjectRequest } from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';

export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  public createProject = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const body = req.body as CreateProjectRequest;
      const project = await this.projectsService.createProject(userId, body);

      res.status(201).json({
        data: project,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public listProjects = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required');
      }

      const workspaceId = typeof req.query['workspaceId'] === 'string' ? req.query['workspaceId'] : undefined;
      const trashed = req.query['trashed'] === 'true';
      const q = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;

      const projects = await this.projectsService.listProjects(userId, {
        workspaceId,
        trashed,
        query: q,
      });

      res.status(200).json({
        data: projects,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getProject = async (
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

      const project = await this.projectsService.getProject(projectId, userId);

      res.status(200).json({
        data: project,
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

