import { z } from 'zod';

export const CursorPaginationInputSchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type CursorPaginationInput = z.infer<typeof CursorPaginationInputSchema>;

export const PaginationMetaSchema = z
  .object({
    requestId: z.string(),
    timestamp: z.string().datetime(),
    nextCursor: z.string().nullable().optional(),
    totalCount: z.number().int().nonnegative().optional(),
  })
  .strict();

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
