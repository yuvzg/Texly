import { z } from 'zod';

export const SubscriptionPlanEnum = {
  FREE: 'FREE',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
} as const;

export const SubscriptionPlanSchema = z.enum(['FREE', 'PRO', 'ENTERPRISE']);
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;
