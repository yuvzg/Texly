import { z } from 'zod';

export const EngineEnum = {
  PDFLATEX: 'PDFLATEX',
  XELATEX: 'XELATEX',
  LUALATEX: 'LUALATEX',
} as const;

export const EngineSchema = z.enum(['PDFLATEX', 'XELATEX', 'LUALATEX']);
export type Engine = z.infer<typeof EngineSchema>;

export const BibToolEnum = {
  AUTO: 'AUTO',
  BIBTEX: 'BIBTEX',
  BIBER: 'BIBER',
  NONE: 'NONE',
} as const;

export const BibToolSchema = z.enum(['AUTO', 'BIBTEX', 'BIBER', 'NONE']);
export type BibTool = z.infer<typeof BibToolSchema>;

export const CompilationStatusEnum = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMED_OUT: 'TIMED_OUT',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export const CompilationStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
  'SUPERSEDED',
]);
export type CompilationStatus = z.infer<typeof CompilationStatusSchema>;

export const CompilationTriggerEnum = {
  MANUAL: 'MANUAL',
  AUTO: 'AUTO',
  AI_ACCEPT: 'AI_ACCEPT',
  RESTORE: 'RESTORE',
} as const;

export const CompilationTriggerSchema = z.enum(['MANUAL', 'AUTO', 'AI_ACCEPT', 'RESTORE']);
export type CompilationTrigger = z.infer<typeof CompilationTriggerSchema>;

export const DiagnosticSeveritySchema = z.enum(['error', 'warning', 'info']);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;
