import { z } from 'zod';
import { ApiErrorEnvelopeSchema } from '../errors/schemas.js';

export const ResponseMetaSchema = z
  .object({
    requestId: z.string(),
    timestamp: z.string().datetime(),
    nextCursor: z.string().nullable().optional(),
  })
  .strict();

export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export const createSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z
    .object({
      data: dataSchema,
      meta: ResponseMetaSchema.optional(),
    })
    .strict();

export { ApiErrorEnvelopeSchema };
export type { ApiErrorEnvelope } from '../errors/schemas.js';
