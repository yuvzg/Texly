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

export const DocumentJoinEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    documentId: DocumentIdSchema,
  })
  .strict();
export type DocumentJoinEvent = z.infer<typeof DocumentJoinEventSchema>;

export const DocumentLeaveEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    documentId: DocumentIdSchema,
  })
  .strict();
export type DocumentLeaveEvent = z.infer<typeof DocumentLeaveEventSchema>;

export const ProjectSyncRequestSchema = z
  .object({
    projectId: ProjectIdSchema,
  })
  .strict();
export type ProjectSyncRequest = z.infer<typeof ProjectSyncRequestSchema>;

export const ProjectSyncDocumentItemSchema = z
  .object({
    id: DocumentIdSchema,
    fileId: z.string(),
    revision: z.number().int().nonnegative(),
    contentHash: z.string(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProjectSyncDocumentItem = z.infer<typeof ProjectSyncDocumentItemSchema>;

export const ProjectSyncFileItemSchema = z
  .object({
    id: z.string(),
    parentId: z.string().nullable(),
    name: z.string(),
    path: z.string(),
    nodeType: z.enum(['FILE', 'FOLDER']),
    updatedAt: z.string().datetime(),
    documentId: z.string().optional(),
  })
  .strict();
export type ProjectSyncFileItem = z.infer<typeof ProjectSyncFileItemSchema>;

export const ProjectSyncResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    mainFileId: z.string().nullable(),
    activeCompilation: z
      .object({
        compilationId: z.string(),
        status: CompilationStatusSchema,
      })
      .strict()
      .nullable(),
    files: z.array(ProjectSyncFileItemSchema),
    documents: z.array(ProjectSyncDocumentItemSchema),
    timestamp: z.string().datetime(),
  })
  .strict();
export type ProjectSyncResponse = z.infer<typeof ProjectSyncResponseSchema>;

export const SocketErrorPayloadSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .strict();
export type SocketErrorPayload = z.infer<typeof SocketErrorPayloadSchema>;

export const AuthRefreshEventSchema = z
  .object({
    token: z.string(),
  })
  .strict();
export type AuthRefreshEvent = z.infer<typeof AuthRefreshEventSchema>;
