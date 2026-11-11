import { z } from 'zod';
import { DocumentIdSchema, ProjectIdSchema, UserIdSchema } from '../ids/index.js';

export const DocumentRevisionChangedEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    documentId: DocumentIdSchema,
    revision: z.number().int().positive(),
    contentHash: z.string(),
    byUserId: UserIdSchema.optional(),
    timestamp: z.string().datetime(),
  })
  .strict();
export type DocumentRevisionChangedEvent = z.infer<typeof DocumentRevisionChangedEventSchema>;
