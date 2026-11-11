import { z } from 'zod';

export const AIProposalStatusEnum = {
  QUEUED: 'QUEUED',
  GENERATING: 'GENERATING',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  STALE: 'STALE',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export const AIProposalStatusSchema = z.enum([
  'QUEUED',
  'GENERATING',
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'STALE',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED',
]);
export type AIProposalStatus = z.infer<typeof AIProposalStatusSchema>;

export const EditOpTypeEnum = {
  insert_before: 'insert_before',
  insert_after: 'insert_after',
  replace: 'replace',
  delete: 'delete',
} as const;

export const EditOpTypeSchema = z.enum(['insert_before', 'insert_after', 'replace', 'delete']);
export type EditOpType = z.infer<typeof EditOpTypeSchema>;

export const AIModeSchema = z.enum(['edit', 'ask']);
export type AIMode = z.infer<typeof AIModeSchema>;

export const ReasoningEffortSchema = z.enum(['low', 'medium', 'high']);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ModelTierSchema = z.enum(['free', 'pro', 'enterprise']);
export type ModelTier = z.infer<typeof ModelTierSchema>;
