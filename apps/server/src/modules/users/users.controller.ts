import type { Request, Response, NextFunction } from 'express';
import {
  UpdateUserRequestSchema,
  UpdateUserSettingsRequestSchema,
  ErrorCodeEnum,
  type ApiSuccessEnvelope,
  type UserDTO,
  type UserSettingsDTO,
} from '@texly/shared';
import { AppError } from '../../http/middleware/error-handler.js';
import type { UsersRepository } from './users.repository.js';
import type { UserSettingsRepository } from './user-settings.repository.js';
import type { WorkspacesRepository } from '../workspaces/workspaces.repository.js';

function createMeta(req: Request) {
  return {
    requestId: req.id ?? (req.header('x-request-id') as string | undefined) ?? 'unknown',
    timestamp: new Date().toISOString(),
  };
}

export class UsersController {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly userSettingsRepo: UserSettingsRepository,
    private readonly workspacesRepo: WorkspacesRepository,
  ) {}

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required.');
      }

      const parsed = UpdateUserRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Validation failed for profile update.',
          { fields: parsed.error.flatten().fieldErrors },
        );
      }

      const updated = await this.usersRepo.update(req.user.id, {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.avatarUrl !== undefined ? { avatarKey: parsed.data.avatarUrl } : {}),
      });

      const plan: 'FREE' | 'PRO' | 'ENTERPRISE' = 'FREE';

      const userDto: UserDTO = {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        avatarUrl: updated.avatarKey ?? null,
        emailVerified: updated.emailVerifiedAt !== null,
        plan,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };

      const response: ApiSuccessEnvelope<UserDTO> = {
        data: userDto,
        meta: createMeta(req),
      };

      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  getSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required.');
      }

      const settings = await this.userSettingsRepo.findByUserId(req.user.id);
      const settingsDto: UserSettingsDTO = {
        userId: req.user.id,
        theme: (settings?.theme as 'light' | 'dark' | 'system') ?? 'system',
        editorFontSize: settings?.editorFontSize ?? 14,
        keymap: (settings?.keymap as 'default' | 'vim' | 'emacs') ?? 'default',
        defaultModelId: settings?.defaultModelId ?? 'openai:gpt-4o',
        autoCompile: settings?.autoCompile ?? false,
        layout: (settings?.layout as Record<string, unknown>) ?? {},
        updatedAt: settings?.updatedAt?.toISOString() ?? new Date().toISOString(),
      };

      const response: ApiSuccessEnvelope<UserSettingsDTO> = {
        data: settingsDto,
        meta: createMeta(req),
      };

      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError(ErrorCodeEnum.UNAUTHENTICATED, 401, 'Authentication required.');
      }

      const parsed = UpdateUserSettingsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          ErrorCodeEnum.VALIDATION_FAILED,
          422,
          'Validation failed for settings update.',
          { fields: parsed.error.flatten().fieldErrors },
        );
      }

      const updated = await this.userSettingsRepo.upsert(req.user.id, {
        theme: parsed.data.theme,
        editorFontSize: parsed.data.editorFontSize,
        keymap: parsed.data.keymap,
        defaultModelId: parsed.data.defaultModelId,
        autoCompile: parsed.data.autoCompile,
        layout: parsed.data.layout,
      });
      const settingsDto: UserSettingsDTO = {
        userId: req.user.id,
        theme: (updated.theme as 'light' | 'dark' | 'system') ?? 'system',
        editorFontSize: updated.editorFontSize,
        keymap: (updated.keymap as 'default' | 'vim' | 'emacs') ?? 'default',
        defaultModelId: updated.defaultModelId ?? 'openai:gpt-4o',
        autoCompile: updated.autoCompile,
        layout: (updated.layout as Record<string, unknown>) ?? {},
        updatedAt: updated.updatedAt.toISOString(),
      };

      const response: ApiSuccessEnvelope<UserSettingsDTO> = {
        data: settingsDto,
        meta: createMeta(req),
      };

      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };
}
