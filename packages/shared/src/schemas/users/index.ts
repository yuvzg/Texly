import { z } from 'zod';
import { UserIdSchema } from '../../ids/index.js';
import { SubscriptionPlanSchema } from '../../enums/subscription.js';

export const UserSettingsDTOSchema = z
  .object({
    userId: UserIdSchema,
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    editorFontSize: z.number().int().min(10).max(32).default(14),
    keymap: z.enum(['default', 'vim', 'emacs']).default('default'),
    defaultModelId: z.string().default('openai:gpt-4o'),
    autoCompile: z.boolean().default(false),
    layout: z
      .object({
        sidebarWidth: z.number().optional(),
        pdfWidth: z.number().optional(),
      })
      .strict()
      .default({}),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type UserSettingsDTO = z.infer<typeof UserSettingsDTOSchema>;

export const UserDTOSchema = z
  .object({
    id: UserIdSchema,
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().url().nullable().optional(),
    emailVerified: z.boolean(),
    plan: SubscriptionPlanSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type UserDTO = z.infer<typeof UserDTOSchema>;

export const UpdateUserRequestSchema = z
  .object({
    name: z.string().min(1).max(120).trim().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .strict();
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const UpdateUserSettingsRequestSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    editorFontSize: z.number().int().min(10).max(32).optional(),
    keymap: z.enum(['default', 'vim', 'emacs']).optional(),
    defaultModelId: z.string().optional(),
    autoCompile: z.boolean().optional(),
    layout: z
      .object({
        sidebarWidth: z.number().optional(),
        pdfWidth: z.number().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type UpdateUserSettingsRequest = z.infer<typeof UpdateUserSettingsRequestSchema>;
