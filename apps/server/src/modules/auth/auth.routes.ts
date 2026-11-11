import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AuthController } from './auth.controller.js';
import type { RateLimiter } from '../../http/middleware/rate-limiter.js';

export interface CreateAuthRouterOptions {
  authController: AuthController;
  authMiddleware: RequestHandler;
  originMiddleware: RequestHandler;
  rateLimiter: RateLimiter;
}

export function createAuthRouter(options: CreateAuthRouterOptions): Router {
  const router = Router();
  const { authController, authMiddleware, originMiddleware, rateLimiter } = options;

  // Rate limiting policies per API_SPECIFICATION.md §1 & SECURITY.md §4.1
  const registerLimit = rateLimiter.middleware({
    prefix: 'register',
    limit: 5,
    windowSeconds: 3600, // 5/hour/IP
  });

  const loginLimit = rateLimiter.middleware({
    prefix: 'login',
    limit: 10,
    windowSeconds: 60, // 10/minute/IP
  });

  const forgotLimit = rateLimiter.middleware({
    prefix: 'forgot_password',
    limit: 5,
    windowSeconds: 3600, // 5/hour/IP
  });

  // Endpoints
  router.post('/register', registerLimit, authController.register);
  router.post('/login', loginLimit, authController.login);
  router.post('/refresh', originMiddleware, authController.refresh);
  router.post('/logout', authMiddleware, authController.logout);
  router.get('/me', authMiddleware, authController.me);

  router.post('/verify-email', authController.verifyEmail);
  router.post('/forgot-password', forgotLimit, authController.forgotPassword);
  router.post('/reset-password', forgotLimit, authController.resetPassword);

  return router;
}
