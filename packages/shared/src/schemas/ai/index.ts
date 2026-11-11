import { z } from 'zod';
import {
  ConversationIdSchema,
  MessageIdSchema,
  ProposalIdSchema,
  DocumentIdSchema,
  ProjectIdSchema,
  FileIdSchema,
} from '../../ids/index.js';
import {
  AIProposalStatusSchema,
  AIModeSchema,
  ReasoningEffortSchema,
  ModelTierSchema,
} from '../../enums/ai.js';

// LLM Models Catalog
export const LLMModelCatalogItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    provider: z.string(),
    tier: ModelTierSchema,
    supportsReasoningEffort: z.boolean(),
    contextWindow: z.number().int().positive(),
    default: z.boolean().default(false),
  })
  .strict();
export type LLMModelCatalogItem = z.infer<typeof LLMModelCatalogItemSchema>;

// Edit Operations
export const InsertBeforeOpSchema = z
  .object({
    id: z.string().default(() => 'op-1'),
    op: z.literal('insert_before'),
    anchor: z.string().min(1, { message: 'Anchor must not be empty' }),
    content: z.string(),
    rationale: z.string().optional(),
  })
  .strict();

export const InsertAfterOpSchema = z
  .object({
    id: z.string().default(() => 'op-1'),
    op: z.literal('insert_after'),
    anchor: z.string().min(1, { message: 'Anchor must not be empty' }),
    content: z.string(),
    rationale: z.string().optional(),
  })
  .strict();

export const ReplaceOpSchema = z
  .object({
    id: z.string().default(() => 'op-1'),
    op: z.literal('replace'),
    anchor: z.string().min(1, { message: 'Anchor must not be empty' }),
    content: z.string(),
    rationale: z.string().optional(),
  })
  .strict();

export const DeleteOpSchema = z
  .object({
    id: z.string().default(() => 'op-1'),
    op: z.literal('delete'),
    anchor: z.string().min(1, { message: 'Anchor must not be empty' }),
    confirmDeletion: z.literal(true, {
      errorMap: () => ({ message: 'Explicit confirmDeletion: true is required for delete op' }),
    }),
    rationale: z.string().optional(),
  })
  .strict();

export const EditOpSchema = z.discriminatedUnion('op', [
  InsertBeforeOpSchema,
  InsertAfterOpSchema,
  ReplaceOpSchema,
  DeleteOpSchema,
]);
export type EditOp = z.infer<typeof EditOpSchema>;

// Structured Response from LLM
export const StructuredLLMResponseSchema = z
  .object({
    summary: z.string().min(1),
    edits: z.array(EditOpSchema),
    warnings: z.array(z.string()).default([]),
  })
  .strict();
export type StructuredLLMResponse = z.infer<typeof StructuredLLMResponseSchema>;

// Diff Stats
export const DiffStatsSchema = z
  .object({
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    hunks: z.number().int().nonnegative(),
  })
  .strict();
export type DiffStats = z.infer<typeof DiffStatsSchema>;

// Validation Result
export const AIValidationResultSchema = z
  .object({
    severity: z.enum(['error', 'warning', 'info']),
    code: z.string(),
    message: z.string(),
  })
  .strict();
export type AIValidationResult = z.infer<typeof AIValidationResultSchema>;

// Proposal DTO
export const ProposalDTOSchema = z
  .object({
    id: ProposalIdSchema,
    conversationId: ConversationIdSchema,
    documentId: DocumentIdSchema,
    status: AIProposalStatusSchema,
    baseRevision: z.number().int().nonnegative(),
    baseContentHash: z.string().optional(),
    model: z.string(),
    provider: z.string(),
    summary: z.string(),
    diffStats: DiffStatsSchema,
    validation: z.array(AIValidationResultSchema),
    proposedContent: z.string().optional(),
    editOps: z.array(EditOpSchema).optional(),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    tokensIn: z.number().int().nonnegative().optional(),
    tokensOut: z.number().int().nonnegative().optional(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable().optional(),
    resultRevision: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type ProposalDTO = z.infer<typeof ProposalDTOSchema>;

export const ProposalSummaryDTOSchema = z
  .object({
    id: ProposalIdSchema,
    status: AIProposalStatusSchema,
    summary: z.string(),
    diffStats: DiffStatsSchema,
  })
  .strict();
export type ProposalSummaryDTO = z.infer<typeof ProposalSummaryDTOSchema>;

// Scope Schema
export const AIScopeFileSchema = z
  .object({
    kind: z.literal('file'),
  })
  .strict();

export const AIScopeSelectionSchema = z
  .object({
    kind: z.literal('selection'),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  })
  .strict();

export const AIScopeSectionSchema = z
  .object({
    kind: z.literal('section'),
    headingPath: z.array(z.string()).min(1),
  })
  .strict();

export const AIScopeSchema = z.discriminatedUnion('kind', [
  AIScopeFileSchema,
  AIScopeSelectionSchema,
  AIScopeSectionSchema,
]);
export type AIScope = z.infer<typeof AIScopeSchema>;

// Message and Conversation DTOs
export const AIMessageDTOSchema = z
  .object({
    id: MessageIdSchema,
    conversationId: ConversationIdSchema,
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    model: z.string().optional(),
    proposal: ProposalSummaryDTOSchema.optional(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AIMessageDTO = z.infer<typeof AIMessageDTOSchema>;

export const AIConversationDTOSchema = z
  .object({
    id: ConversationIdSchema,
    projectId: ProjectIdSchema,
    title: z.string().nullable().optional(),
    archived: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AIConversationDTO = z.infer<typeof AIConversationDTOSchema>;

export const CreateConversationRequestSchema = z
  .object({
    title: z.string().max(200).optional(),
  })
  .strict();
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;

// Message Create Request
export const CreateAIMessageRequestSchema = z
  .object({
    content: z.string().min(1).max(8000),
    mode: AIModeSchema.default('edit'),
    documentId: DocumentIdSchema,
    baseRevision: z.number().int().nonnegative(),
    scope: AIScopeSchema.default({ kind: 'file' }),
    model: z.string().default('openai:gpt-4o'),
    reasoningEffort: ReasoningEffortSchema.default('medium'),
    include: z
      .object({
        compileErrors: z.boolean().default(false),
        attachments: z.array(FileIdSchema).default([]),
        supersede: z.boolean().default(false),
      })
      .strict()
      .default({}),
  })
  .strict();
export type CreateAIMessageRequest = z.infer<typeof CreateAIMessageRequestSchema>;

export const CreateAIMessageResponseDataSchema = z
  .object({
    message: AIMessageDTOSchema,
    proposal: ProposalDTOSchema,
  })
  .strict();
export type CreateAIMessageResponseData = z.infer<typeof CreateAIMessageResponseDataSchema>;

export const AcceptProposalRequestSchema = z
  .object({
    expectedBaseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type AcceptProposalRequest = z.infer<typeof AcceptProposalRequestSchema>;

export const AcceptProposalResponseDataSchema = z
  .object({
    documentId: DocumentIdSchema,
    revision: z.number().int().positive(),
    contentHash: z.string(),
    proposalId: ProposalIdSchema,
    status: z.literal('ACCEPTED'),
  })
  .strict();
export type AcceptProposalResponseData = z.infer<typeof AcceptProposalResponseDataSchema>;

export const RejectProposalResponseDataSchema = z
  .object({
    status: z.literal('REJECTED'),
  })
  .strict();
export type RejectProposalResponseData = z.infer<typeof RejectProposalResponseDataSchema>;

export const AIUsageEventSchema = z
  .object({
    proposalId: ProposalIdSchema,
    model: z.string(),
    provider: z.string(),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    costMicroUsd: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    timestamp: z.string().datetime(),
  })
  .strict();
export type AIUsageEvent = z.infer<typeof AIUsageEventSchema>;

export const AIErrorDTOSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();
export type AIErrorDTO = z.infer<typeof AIErrorDTOSchema>;
