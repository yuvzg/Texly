import { z } from 'zod';

export const WorkspaceRoleEnum = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

export const WorkspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const ProjectRoleEnum = {
  OWNER: 'OWNER',
  EDITOR: 'EDITOR',
  COMMENTER: 'COMMENTER',
  VIEWER: 'VIEWER',
} as const;

export const ProjectRoleSchema = z.enum(['OWNER', 'EDITOR', 'COMMENTER', 'VIEWER']);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;
