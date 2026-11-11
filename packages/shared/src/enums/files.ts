import { z } from 'zod';

export const NodeTypeEnum = {
  FILE: 'FILE',
  FOLDER: 'FOLDER',
} as const;

export const NodeTypeSchema = z.enum(['FILE', 'FOLDER']);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const FileKindEnum = {
  TEXT: 'TEXT',
  BINARY: 'BINARY',
} as const;

export const FileKindSchema = z.enum(['TEXT', 'BINARY']);
export type FileKind = z.infer<typeof FileKindSchema>;
