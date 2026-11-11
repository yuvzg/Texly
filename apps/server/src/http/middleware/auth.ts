import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler.js';
import { ErrorCodeEnum } from '@texly/shared';
import type { JwtService } from '../../modules/auth/jwt.service.js';
import type { SessionService } from '../../modules/auth/session.service.js';
import type { UsersRepository } from '../../modules/users/users.repository.js';
import type { User, Session } from '@texly/db';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionRecord?: Session;
    }
  }
}

export function createAuthMiddleware(
  jwtService: JwtService,
  sessionService: SessionService,
  usersRepo: UsersRepository,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Authenticated JSON responses must never be cached by intermediaries
    res.setHeader('Cache-Control', 'no-store');

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next(
        new AppError(
          ErrorCodeEnum.UNAUTHENTICATED,
          401,
          'Authorization header with Bearer token is required.',
        ),
      );
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      next(new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Bearer token is missing.'));
      return;
    }

    try {
      const payload = await jwtService.verifyAccessToken(token);

      // Validate that session is active and not revoked
      const session = await sessionService.validateSession(payload.sid);

      // Fetch user profile
      const user = await usersRepo.findById(payload.sub);
      if (!user || user.deletedAt !== null || user.disabledAt !== null) {
        next(new AppError(ErrorCodeEnum.ACCOUNT_DISABLED, 403, 'Account is disabled.'));
        return;
      }

      req.user = user;
      req.sessionRecord = session;

      next();
    } catch (err: unknown) {
      next(err);
    }
  };
}

export function validateOriginMiddleware(allowedOrigins: string[]) {
  const allowedSet = new Set(allowedOrigins.map((o) => o.toLowerCase()));

  return (req: Request, _res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    // If an Origin header is sent (browsers send it on cross-origin requests and POST requests),
    // verify it matches the allowlist.
    if (origin) {
      if (!allowedSet.has(origin.toLowerCase())) {
        next(
          new AppError(
            ErrorCodeEnum.FORBIDDEN,
            403,
            `Origin '${origin}' is not permitted to access this resource.`,
          ),
        );
        return;
      }
    }

    next();
  };
}
