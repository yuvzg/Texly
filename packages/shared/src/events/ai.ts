import { z } from 'zod';
import {
  ProposalIdSchema,
  ProjectIdSchema,
  DocumentIdSchema,
  MessageIdSchema,
} from '../ids/index.js';
import { AIProposalStatusSchema } from '../enums/ai.js';
import { DiffStatsSchema } from '../schemas/ai/index.js';

export const AIProposalUpdatedEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    documentId: DocumentIdSchema,
    proposalId: ProposalIdSchema,
    status: AIProposalStatusSchema,
    summary: z.string().optional(),
    diffStats: DiffStatsSchema.optional(),
    errorCode: z.string().optional(),
    timestamp: z.string().datetime(),
  })
  .strict();
export type AIProposalUpdatedEvent = z.infer<typeof AIProposalUpdatedEventSchema>;

export const AIMessageDeltaEventSchema = z
  .object({
    projectId: ProjectIdSchema,
    messageId: MessageIdSchema,
    delta: z.string(),
    timestamp: z.string().datetime(),
  })
  .strict();
export type AIMessageDeltaEvent = z.infer<typeof AIMessageDeltaEventSchema>;
