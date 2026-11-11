import { z } from 'zod';
import { ProjectIdSchema, DocumentIdSchema } from '../ids/index.js';
import { CompilationStatusSchema } from '../enums/compilation.js';
import { AIProposalStatusSchema } from '../enums/ai.js';

export const ProjectSyncEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    activeCompilation: z
      .object({
        compilationId: z.string(),
        status: CompilationStatusSchema,
      })
      .strict()
      .nullable(),
    pendingProposal: z
      .object({
        proposalId: z.string(),
        documentId: DocumentIdSchema,
        status: AIProposalStatusSchema,
      })
      .strict()
      .nullable(),
    timestamp: z.string().datetime(),
  })
  .strict();
export type ProjectSyncEvent = z.infer<typeof ProjectSyncEventSchema>;

// Client -> Server events
export const ProjectJoinEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    lastSeenEventId: z.string().optional(),
  })
  .strict();
export type ProjectJoinEvent = z.infer<typeof ProjectJoinEventSchema>;

export const ProjectLeaveEventSchema = z
  .object({
    projectId: ProjectIdSchema,
  })
  .strict();
export type ProjectLeaveEvent = z.infer<typeof ProjectLeaveEventSchema>;

export const DocumentFocusEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    documentId: DocumentIdSchema,
  })
  .strict();
export type DocumentFocusEvent = z.infer<typeof DocumentFocusEventSchema>;

export const AuthRefreshEventSchema = z
  .object({
    token: z.string(),
  })
  .strict();
export type AuthRefreshEvent = z.infer<typeof AuthRefreshEventSchema>;
