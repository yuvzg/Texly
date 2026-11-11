import { z } from 'zod';
import { UserIdSchema, WorkspaceIdSchema } from '../../ids/index.js';
import { WorkspaceRoleSchema } from '../../enums/roles.js';
import { SubscriptionPlanSchema } from '../../enums/subscription.js';
import { UserSettingsDTOSchema } from '../users/index.js';

export const RegisterRequestSchema = z
  .object({
    email: z.string().email().max(254).toLowerCase().trim(),
    password: z.string().min(10).max(128),
    name: z.string().min(1).max(120).trim(),
  })
  .strict();
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z
  .object({
    email: z.string().email().max(254).toLowerCase().trim(),
    password: z.string().min(1).max(128),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserSummaryDTOSchema = z
  .object({
    id: UserIdSchema,
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().url().nullable().optional(),
    emailVerified: z.boolean(),
  })
  .strict();
export type UserSummaryDTO = z.infer<typeof UserSummaryDTOSchema>;

export const AuthTokenResponseDataSchema = z
  .object({
    user: UserSummaryDTOSchema,
    accessToken: z.string(),
    expiresIn: z.number().int().positive(),
  })
  .strict();
export type AuthTokenResponseData = z.infer<typeof AuthTokenResponseDataSchema>;

export const RefreshResponseDataSchema = z
  .object({
    accessToken: z.string(),
    expiresIn: z.number().int().positive(),
  })
  .strict();
export type RefreshResponseData = z.infer<typeof RefreshResponseDataSchema>;

export const LogoutRequestSchema = z
  .object({
    everywhere: z.boolean().optional(),
  })
  .strict();
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const VerifyEmailRequestSchema = z
  .object({
    token: z.string().min(1).max(256),
  })
  .strict();
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

export const ForgotPasswordRequestSchema = z
  .object({
    email: z.string().email().max(254).toLowerCase().trim(),
  })
  .strict();
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z
  .object({
    token: z.string().min(1).max(256),
    password: z.string().min(10).max(128),
  })
  .strict();
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const SessionDTOSchema = z
  .object({
    id: z.string(),
    userId: UserIdSchema,
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
    lastActiveAt: z.string().datetime(),
  })
  .strict();
export type SessionDTO = z.infer<typeof SessionDTOSchema>;

export const AuthWorkspaceSummaryDTOSchema = z
  .object({
    id: WorkspaceIdSchema,
    name: z.string(),
    slug: z.string(),
    role: WorkspaceRoleSchema,
    isPersonal: z.boolean(),
  })
  .strict();
export type AuthWorkspaceSummaryDTO = z.infer<typeof AuthWorkspaceSummaryDTOSchema>;

export const AuthMeResponseDataSchema = z
  .object({
    user: UserSummaryDTOSchema,
    workspaces: z.array(AuthWorkspaceSummaryDTOSchema),
    settings: UserSettingsDTOSchema,
    plan: SubscriptionPlanSchema,
  })
  .strict();
export type AuthMeResponseData = z.infer<typeof AuthMeResponseDataSchema>;
