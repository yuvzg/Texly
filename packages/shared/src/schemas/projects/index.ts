import { z } from 'zod';
import {
  ProjectIdSchema,
  WorkspaceIdSchema,
  UserIdSchema,
  FileIdSchema,
  InviteIdSchema,
} from '../../ids/index.js';
import { ProjectRoleSchema } from '../../enums/roles.js';
import { EngineSchema, BibToolSchema } from '../../enums/compilation.js';

export const ProjectTemplateSchema = z.enum([
  'blank',
  'article',
  'report',
  'beamer',
  'ieee-conference',
  'resume',
]);
export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema>;

export const ProjectDTOSchema = z
  .object({
    id: ProjectIdSchema,
    workspaceId: WorkspaceIdSchema,
    name: z.string().min(1).max(160).trim(),
    description: z.string().max(1000).nullable().optional(),
    engine: EngineSchema,
    bibTool: BibToolSchema,
    mainFileId: FileIdSchema.nullable().optional(),
    autoCompile: z.boolean(),
    role: ProjectRoleSchema.optional(),
    storageBytes: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    trashedAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export type ProjectDTO = z.infer<typeof ProjectDTOSchema>;

export const CreateProjectRequestSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    name: z.string().min(1).max(160).trim(),
    description: z.string().max(1000).optional(),
    template: ProjectTemplateSchema.default('blank'),
    engine: EngineSchema.default('PDFLATEX'),
  })
  .strict();
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(160).trim().optional(),
    description: z.string().max(1000).nullable().optional(),
    engine: EngineSchema.optional(),
    bibTool: BibToolSchema.optional(),
    mainFileId: FileIdSchema.nullable().optional(),
    autoCompile: z.boolean().optional(),
  })
  .strict();
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export const ProjectMemberDTOSchema = z
  .object({
    userId: UserIdSchema,
    name: z.string(),
    email: z.string().email(),
    role: ProjectRoleSchema,
    since: z.string().datetime(),
  })
  .strict();
export type ProjectMemberDTO = z.infer<typeof ProjectMemberDTOSchema>;

export const ProjectInviteDTOSchema = z
  .object({
    id: InviteIdSchema,
    projectId: ProjectIdSchema,
    email: z.string().email(),
    role: z.enum(['EDITOR', 'COMMENTER', 'VIEWER']),
    status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']),
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type ProjectInviteDTO = z.infer<typeof ProjectInviteDTOSchema>;

export const CreateProjectInviteRequestSchema = z
  .object({
    email: z.string().email().max(254).toLowerCase().trim(),
    role: z.enum(['EDITOR', 'COMMENTER', 'VIEWER']),
  })
  .strict();
export type CreateProjectInviteRequest = z.infer<typeof CreateProjectInviteRequestSchema>;

export const AcceptInviteRequestSchema = z
  .object({
    token: z.string().min(1).max(256),
  })
  .strict();
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequestSchema>;

export const ProjectListQuerySchema = z
  .object({
    workspaceId: WorkspaceIdSchema.optional(),
    q: z.string().max(100).optional(),
    trashed: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    sort: z.enum(['lastOpened', 'updated', 'name']).default('updated'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;
