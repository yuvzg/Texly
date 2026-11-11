import { z } from 'zod';
import { CompilationIdSchema, ProjectIdSchema } from '../ids/index.js';
import { CompilationStatusSchema } from '../enums/compilation.js';

export const CompilationQueuedEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    compilationId: CompilationIdSchema,
    status: z.literal('QUEUED'),
    timestamp: z.string().datetime(),
  })
  .strict();
export type CompilationQueuedEvent = z.infer<typeof CompilationQueuedEventSchema>;

export const CompilationStartedEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    compilationId: CompilationIdSchema,
    status: z.literal('RUNNING'),
    timestamp: z.string().datetime(),
  })
  .strict();
export type CompilationStartedEvent = z.infer<typeof CompilationStartedEventSchema>;

export const CompilationFinishedEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    compilationId: CompilationIdSchema,
    status: CompilationStatusSchema,
    durationMs: z.number().int().nonnegative().optional(),
    errorCount: z.number().int().nonnegative().optional(),
    warningCount: z.number().int().nonnegative().optional(),
    hasPdf: z.boolean().optional(),
    timestamp: z.string().datetime(),
  })
  .strict();
export type CompilationFinishedEvent = z.infer<typeof CompilationFinishedEventSchema>;
