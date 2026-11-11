import { z } from 'zod';
import { ProjectIdSchema, FileIdSchema } from '../ids/index.js';

export const FileTreeOpSchema = z.enum(['create', 'rename', 'move', 'delete', 'upload']);
export type FileTreeOp = z.infer<typeof FileTreeOpSchema>;

export const FileTreeChangedEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    op: FileTreeOpSchema,
    fileId: FileIdSchema,
    path: z.string().optional(),
    timestamp: z.string().datetime(),
  })
  .strict();
export type FileTreeChangedEvent = z.infer<typeof FileTreeChangedEventSchema>;
