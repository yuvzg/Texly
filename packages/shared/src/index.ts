import { z } from 'zod';

export const ApiMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string().datetime(),
});
export type ApiMeta = z.infer<typeof ApiMetaSchema>;

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: ApiMetaSchema.optional(),
  });

export const ApiErrorItemSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ApiErrorEnvelopeSchema = z.object({
  error: ApiErrorItemSchema,
  meta: ApiMetaSchema.optional(),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string().datetime(),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

