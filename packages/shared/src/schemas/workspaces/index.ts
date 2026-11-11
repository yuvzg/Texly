import { z } from 'zod';
import { WorkspaceIdSchema, UserIdSchema } from '../../ids/index.js';
import { WorkspaceRoleSchema } from '../../enums/roles.js';
import { UserSummaryDTOSchema } from '../auth/index.js';

export const WorkspaceDTOSchema = z
  .object({
    id: WorkspaceIdSchema,
    name: z.string().min(1).max(100).trim(),
    slug: z.string().min(1).max(100).trim(),
    isPersonal: z.boolean(),
    ownerId: UserIdSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type WorkspaceDTO = z.infer<typeof WorkspaceDTOSchema>;

export const WorkspaceMemberDTOSchema = z
  .object({
    id: z.string(),
    workspaceId: WorkspaceIdSchema,
    userId: UserIdSchema,
    role: WorkspaceRoleSchema,
    joinedAt: z.string().datetime(),
    user: UserSummaryDTOSchema.optional(),
  })
  .strict();
export type WorkspaceMemberDTO = z.infer<typeof WorkspaceMemberDTOSchema>;

export const WorkspaceWithRoleDTOSchema = z
  .object({
    id: WorkspaceIdSchema,
    name: z.string(),
    slug: z.string(),
    role: WorkspaceRoleSchema,
    isPersonal: z.boolean(),
    usage: z
      .object({
        storageBytes: z.number().int().nonnegative(),
        quota: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type WorkspaceWithRoleDTO = z.infer<typeof WorkspaceWithRoleDTOSchema>;

export const CreateWorkspaceRequestSchema = z
  .object({
    name: z.string().min(1).max(100).trim(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/, {
        message: 'Slug must contain only lowercase alphanumeric characters and hyphens',
      })
      .optional(),
  })
  .strict();
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;

export const UpdateWorkspaceRequestSchema = z
  .object({
    name: z.string().min(1).max(100).trim().optional(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
  })
  .strict();
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>;
