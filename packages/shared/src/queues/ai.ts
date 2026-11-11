import { z } from 'zod';
import {
  ProposalIdSchema,
  ProjectIdSchema,
  ConversationIdSchema,
  DocumentIdSchema,
  FileIdSchema,
} from '../ids/index.js';
import { ReasoningEffortSchema } from '../enums/ai.js';
import { AIScopeSchema } from '../schemas/ai/index.js';

export const AI_GENERATE_QUEUE = 'ai-generate';

export const AIGenerateJobV1Schema = z
  .object({
    version: z.literal(1).default(1),
    proposalId: ProposalIdSchema,
    projectId: ProjectIdSchema,
    conversationId: ConversationIdSchema,
    documentId: DocumentIdSchema,
    baseRevision: z.number().int().nonnegative(),
    baseContentHash: z.string(),
    prompt: z.string().min(1).max(8000),
    model: z.string(),
    reasoningEffort: ReasoningEffortSchema.default('medium'),
    scope: AIScopeSchema,
    attachments: z.array(FileIdSchema).default([]),
    includeCompileErrors: z.boolean().default(false),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AIGenerateJobV1 = z.infer<typeof AIGenerateJobV1Schema>;
