import { z } from 'zod';

export const VersionSourceEnum = {
  MANUAL: 'MANUAL',
  AUTO_CHECKPOINT: 'AUTO_CHECKPOINT',
  PRE_AI: 'PRE_AI',
  AI_ACCEPT: 'AI_ACCEPT',
  PRE_RESTORE: 'PRE_RESTORE',
  RESTORE: 'RESTORE',
} as const;

export const VersionSourceSchema = z.enum([
  'MANUAL',
  'AUTO_CHECKPOINT',
  'PRE_AI',
  'AI_ACCEPT',
  'PRE_RESTORE',
  'RESTORE',
]);
export type VersionSource = z.infer<typeof VersionSourceSchema>;
