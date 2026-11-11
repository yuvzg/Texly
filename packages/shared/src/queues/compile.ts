import { z } from 'zod';
import { CompilationIdSchema, ProjectIdSchema } from '../ids/index.js';
import { EngineSchema, BibToolSchema, CompilationStatusSchema } from '../enums/compilation.js';
import { CompilationDiagnosticSchema } from '../schemas/compilations/index.js';

export const COMPILE_QUEUE = 'compile';
export const COMPILE_RESULTS_QUEUE = 'compile-results';
export const COMPILE_MAINTENANCE_QUEUE = 'compile-maintenance';

export const CompileLimitsSchema = z
  .object({
    timeoutSec: z.number().int().positive().default(60),
    memoryMb: z.number().int().positive().default(1024),
    cpus: z.number().positive().default(1),
    pidsLimit: z.number().int().positive().default(256),
    maxPdfMb: z.number().int().positive().default(50),
    maxLogMb: z.number().int().positive().default(5),
    maxOutputFiles: z.number().int().positive().default(200),
    workDirMb: z.number().int().positive().default(512),
  })
  .strict();
export type CompileLimits = z.infer<typeof CompileLimitsSchema>;

export const PresignedGetAssetSchema = z
  .object({
    path: z.string(),
    url: z.string().url(),
    sha256: z.string(),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();

export const CompileJobV1Schema = z
  .object({
    version: z.literal(1),
    compilationId: CompilationIdSchema,
    projectId: ProjectIdSchema,
    engine: EngineSchema,
    bibTool: BibToolSchema,
    mainFile: z.string().min(1),
    draft: z.boolean().default(false),
    limits: CompileLimitsSchema,
    inputs: z
      .object({
        textBundle: z
          .object({
            url: z.string().url(),
            sha256: z.string(),
            sizeBytes: z.number().int().nonnegative(),
          })
          .strict(),
        assets: z.array(PresignedGetAssetSchema),
      })
      .strict(),
    outputs: z
      .object({
        pdf: z.object({ url: z.string().url() }).strict(),
        synctex: z.object({ url: z.string().url() }).strict(),
        log: z.object({ url: z.string().url() }).strict(),
      })
      .strict(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type CompileJobV1 = z.infer<typeof CompileJobV1Schema>;

export const CompileResultV1Schema = z
  .object({
    version: z.literal(1),
    compilationId: CompilationIdSchema,
    projectId: ProjectIdSchema,
    status: CompilationStatusSchema,
    exitCode: z.number().int(),
    durationMs: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative().optional(),
    diagnostics: z.array(CompilationDiagnosticSchema),
    outputs: z
      .object({
        pdfKey: z.string().optional(),
        synctexKey: z.string().optional(),
        logKey: z.string().optional(),
      })
      .strict(),
    outputSizes: z
      .object({
        pdfBytes: z.number().int().nonnegative().optional(),
        synctexBytes: z.number().int().nonnegative().optional(),
        logBytes: z.number().int().nonnegative().optional(),
      })
      .strict(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
  })
  .strict();
export type CompileResultV1 = z.infer<typeof CompileResultV1Schema>;
