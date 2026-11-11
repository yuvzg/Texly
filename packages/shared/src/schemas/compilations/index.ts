import { z } from 'zod';
import {
  CompilationIdSchema,
  ProjectIdSchema,
  FileIdSchema,
  UserIdSchema,
} from '../../ids/index.js';
import {
  EngineSchema,
  BibToolSchema,
  CompilationStatusSchema,
  CompilationTriggerSchema,
  DiagnosticSeveritySchema,
} from '../../enums/compilation.js';

export const CompilationDTOSchema = z
  .object({
    id: CompilationIdSchema,
    projectId: ProjectIdSchema,
    status: CompilationStatusSchema,
    trigger: CompilationTriggerSchema,
    engine: EngineSchema,
    bibTool: BibToolSchema,
    mainFilePath: z.string(),
    queuedAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable().optional(),
    finishedAt: z.string().datetime().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    errorCode: z.string().nullable().optional(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative().nullable().optional(),
    hasPdf: z.boolean(),
    cacheHit: z.boolean(),
    requestedBy: UserIdSchema.optional(),
  })
  .strict();
export type CompilationDTO = z.infer<typeof CompilationDTOSchema>;

export const CreateCompilationRequestSchema = z
  .object({
    trigger: CompilationTriggerSchema.default('MANUAL'),
    engine: EngineSchema.optional(),
    bibTool: BibToolSchema.optional(),
    mainFileId: FileIdSchema.optional(),
    draft: z.boolean().default(false),
  })
  .strict();
export type CreateCompilationRequest = z.infer<typeof CreateCompilationRequestSchema>;

export const CompilationDiagnosticSchema = z
  .object({
    ordinal: z.number().int().nonnegative().optional(),
    level: DiagnosticSeveritySchema,
    file: z.string(),
    line: z.number().int().nonnegative(),
    message: z.string(),
    context: z.string().optional(),
    kind: z.string().optional(),
  })
  .strict();
export type CompilationDiagnostic = z.infer<typeof CompilationDiagnosticSchema>;

export const CompilationLogDTOSchema = z
  .object({
    diagnostics: z.array(CompilationDiagnosticSchema),
    counts: z
      .object({
        errors: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative(),
      })
      .strict(),
    truncated: z.boolean(),
    rawLogUrl: z.string().url().optional(),
  })
  .strict();
export type CompilationLogDTO = z.infer<typeof CompilationLogDTOSchema>;

export const CompilationPdfResponseDataSchema = z
  .object({
    url: z.string().url(),
    expiresAt: z.string().datetime(),
    sizeBytes: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative(),
  })
  .strict();
export type CompilationPdfResponseData = z.infer<typeof CompilationPdfResponseDataSchema>;

export const SyncTexForwardRequestSchema = z
  .object({
    file: z.string(),
    line: z.number().int().positive(),
    column: z.number().int().positive().default(1),
  })
  .strict();
export type SyncTexForwardRequest = z.infer<typeof SyncTexForwardRequestSchema>;

export const SyncTexForwardMatchSchema = z
  .object({
    page: z.number().int().positive(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .strict();
export type SyncTexForwardMatch = z.infer<typeof SyncTexForwardMatchSchema>;

export const SyncTexForwardResponseDataSchema = z
  .object({
    matches: z.array(SyncTexForwardMatchSchema),
  })
  .strict();
export type SyncTexForwardResponseData = z.infer<typeof SyncTexForwardResponseDataSchema>;

export const SyncTexInverseRequestSchema = z
  .object({
    page: z.number().int().positive(),
    x: z.number(),
    y: z.number(),
  })
  .strict();
export type SyncTexInverseRequest = z.infer<typeof SyncTexInverseRequestSchema>;

export const SyncTexInverseResponseDataSchema = z
  .object({
    file: z.string(),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
  })
  .strict();
export type SyncTexInverseResponseData = z.infer<typeof SyncTexInverseResponseDataSchema>;
