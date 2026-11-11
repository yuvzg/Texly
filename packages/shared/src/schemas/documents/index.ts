import { z } from 'zod';
import { DocumentIdSchema, FileIdSchema, ProjectIdSchema, UserIdSchema } from '../../ids/index.js';

export const DocumentDTOSchema = z
  .object({
    id: DocumentIdSchema,
    fileId: FileIdSchema,
    projectId: ProjectIdSchema,
    path: z.string(),
    content: z.string(),
    contentHash: z.string(),
    revision: z.number().int().nonnegative(),
    sizeBytes: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    updatedBy: UserIdSchema.optional(),
  })
  .strict();
export type DocumentDTO = z.infer<typeof DocumentDTOSchema>;

export const PutDocumentContentRequestSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    content: z.string().max(2.5 * 1024 * 1024, { message: 'Document content limit is 2.5MB' }),
    clientHash: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]+$/)
      .optional(),
  })
  .strict();
export type PutDocumentContentRequest = z.infer<typeof PutDocumentContentRequestSchema>;

export const PutDocumentContentResponseDataSchema = z
  .object({
    revision: z.number().int().positive(),
    contentHash: z.string(),
    updatedAt: z.string().datetime(),
    unchanged: z.boolean(),
  })
  .strict();
export type PutDocumentContentResponseData = z.infer<typeof PutDocumentContentResponseDataSchema>;
