import type { Request, Response, NextFunction } from 'express';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  VerifyEmailRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  ErrorCodeEnum,
  type ApiSuccessEnvelope,
  type AuthTokenResponseData,
  type RefreshResponseData,
  type AuthMeResponseData,
} from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import { setRefreshCookie, clearRefreshCookie, type CookieOptions } from './cookie.utils.js';
import type { AuthService } from './auth.service.js';

function createMeta(req: Request) {
  return {
    requestId: req.id ?? (req.header('x-request-id') as string | undefined) ?? 'unknown',
    timestamp: new Date().toISOString(),
  };
}

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieOptions: CookieOptions,
  ) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = RegisterRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Validation failed for registration input.',
          { fields: parsed.error.flatten().fieldErrors },
        );
      }

      const result = await this.authService.register(parsed.data, {
        userAgent: req.header('user-agent'),
        ipAddress: req.ip,
      });

      setRefreshCookie(res, result.refreshToken, this.cookieOptions);

      const response: ApiSuccessEnvelope<AuthTokenResponseData> = {
        data: {
          user: result.user,
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        },
        meta: createMeta(req),
      };

      res.status(201).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = LoginRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Validation failed for login input.',
          { fields: parsed.error.flatten().fieldErrors },
        );
      }

      const result = await this.authService.login(parsed.data, {
        userAgent: req.header('user-agent'),
        ipAddress: req.ip,
      });

      setRefreshCookie(res, result.refreshToken, this.cookieOptions);

      const response: ApiSuccessEnvelope<AuthTokenResponseData> = {
        data: {
          user: result.user,
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        },
        meta: createMeta(req),
      };

      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = (req.cookies as Record<string, string> | undefined)?.rt;
      if (!refreshToken) {
        throw new AppError(ErrorCodeEnum.REFRESH_INVALID, 401, 'Refresh token cookie is required.');
      }

      try {
        const result = await this.authService.refresh(refreshToken, {
          userAgent: req.header('user-agent'),
          ipAddress: req.ip,
        });

        setRefreshCookie(res, result.nextRefreshToken, this.cookieOptions);

        const response: ApiSuccessEnvelope<RefreshResponseData> = {
          data: {
            accessToken: result.accessToken,
            expiresIn: result.expiresIn,
          },
          meta: createMeta(req),
        };

        res.status(200).json(response);
      } catch (err: unknown) {
        // If refresh fails due to reuse or invalid token, clear the cookie
        clearRefreshCookie(res, this.cookieOptions);
        throw err;
      }
    } catch (err: unknown) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = LogoutRequestSchema.safeParse(req.body ?? {});
      const everywhere = parsed.success ? parsed.data.everywhere : false;

      if (req.user) {
        await this.authService.logout({
          userId: req.user.id,
          sessionId: req.sessionRecord?.id,
          familyId: req.sessionRecord?.familyId,
          everywhere,
        });
      }

      clearRefreshCookie(res, this.cookieOptions);
      res.status(204).send();
    } catch (err: unknown) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required.');
      }

      const result = await this.authService.getMe(req.user.id);
      const response: ApiSuccessEnvelope<AuthMeResponseData> = {
        data: result,
        meta: createMeta(req),
      };

      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = VerifyEmailRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Validation failed for verification token.',
          { fields: parsed.error.flatten().fieldErrors },
        );
      }

      await this.authService.verifyEmail(parsed.data.token);

      const response: ApiSuccessEnvelope<{ verified: boolean }> = {
        data: { verified: true },
        meta: createMeta(req),
      };

      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ForgotPasswordRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(ErrorCodeEnum.VALIDATION_FAILED, 422, 'Validation failed for email.', {
          fields: parsed.error.flatten().fieldErrors,
        });
      }

      await this.authService.forgotPassword(parsed.data.email);

      // Return generic 202 Accepted to prevent account enumeration
      const response: ApiSuccessEnvelope<{ message: string }> = {
        data: {
          message:
            'If an account exists for this email address, a password reset link has been dispatched.',
        },
        meta: createMeta(req),
      };

      res.status(202).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ResetPasswordRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Validation failed for password reset input.',
          { fields: parsed.error.flatten().fieldErrors },
        );
      }

      await this.authService.resetPassword(parsed.data.token, parsed.data.password);
      clearRefreshCookie(res, this.cookieOptions);

      const response: ApiSuccessEnvelope<{ message: string }> = {
        data: {
          message: 'Password reset successful. Please log in with your new credentials.',
        },
        meta: createMeta(req),
      };

      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };
}
