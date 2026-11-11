import { z } from 'zod';
import {
  VersionIdSchema,
  DocumentIdSchema,
  UserIdSchema,
  ProposalIdSchema,
} from '../../ids/index.js';
import { VersionSourceSchema } from '../../enums/versions.js';
import { DiffStatsSchema } from '../ai/index.js';

export const DocumentVersionDTOSchema = z
  .object({
    id: VersionIdSchema,
    documentId: DocumentIdSchema,
    revision: z.number().int().nonnegative(),
    source: VersionSourceSchema,
    label: z.string().max(100).nullable().optional(),
    sizeBytes: z.number().int().nonnegative(),
    content: z.string().optional(),
    createdBy: UserIdSchema.nullable().optional(),
    proposalId: ProposalIdSchema.nullable().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type DocumentVersionDTO = z.infer<typeof DocumentVersionDTOSchema>;

export const CreateVersionRequestSchema = z
  .object({
    label: z.string().max(100).trim().optional(),
  })
  .strict();
export type CreateVersionRequest = z.infer<typeof CreateVersionRequestSchema>;

export const RestoreVersionRequestSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type RestoreVersionRequest = z.infer<typeof RestoreVersionRequestSchema>;

export const RestoreVersionResponseDataSchema = z
  .object({
    revision: z.number().int().positive(),
    contentHash: z.string(),
  })
  .strict();
export type RestoreVersionResponseData = z.infer<typeof RestoreVersionResponseDataSchema>;

export const CompareVersionsQuerySchema = z
  .object({
    from: z.string(),
    to: z.string(),
    format: z.enum(['unified', 'hunks']).default('unified'),
  })
  .strict();
export type CompareVersionsQuery = z.infer<typeof CompareVersionsQuerySchema>;

export const CompareVersionsResponseDataSchema = z
  .object({
    from: z
      .object({
        id: z.string(),
        revision: z.number().int().nonnegative(),
      })
      .strict(),
    to: z
      .object({
        id: z.string(),
        revision: z.number().int().nonnegative(),
      })
      .strict(),
    diff: z.string(),
    stats: DiffStatsSchema,
  })
  .strict();
export type CompareVersionsResponseData = z.infer<typeof CompareVersionsResponseDataSchema>;
