import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { UsersController } from './users.controller.js';

export interface CreateUsersRouterOptions {
  usersController: UsersController;
  authMiddleware: RequestHandler;
}

export function createUsersRouter(options: CreateUsersRouterOptions): Router {
  const router = Router();
  const { usersController, authMiddleware } = options;

  router.patch('/me', authMiddleware, usersController.updateProfile);
  router.get('/me/settings', authMiddleware, usersController.getSettings);
  router.patch('/me/settings', authMiddleware, usersController.updateSettings);

  return router;
}
