import { z } from 'zod';
import { ErrorCodeSchema } from './codes.js';

export const FieldValidationErrorSchema = z
  .object({
    path: z.string(),
    code: z.string(),
    message: z.string(),
  })
  .strict();

export type FieldValidationError = z.infer<typeof FieldValidationErrorSchema>;

export const ApiErrorItemSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    fields: z.array(FieldValidationErrorSchema).optional(),
    requestId: z.string().optional(),
  })
  .strict();

export type ApiErrorItem = z.infer<typeof ApiErrorItemSchema>;

export const ApiErrorEnvelopeSchema = z
  .object({
    error: ApiErrorItemSchema,
    meta: z
      .object({
        requestId: z.string(),
        timestamp: z.string().datetime(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
