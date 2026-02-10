/**
 * Subscription route handler — returns current user's plan and usage for the frontend
 */

import type { EnvConfig } from "../types/index.js";
import { getSubscription } from "../services/subscriptionService.js";
import { checkUsage } from "../services/usageService.js";

export interface SubscriptionResponse {
  plan: "free" | "pro";
  status: string;
  billingInterval: "monthly" | "yearly" | null;
  currentPeriodEnd: string | null;
  usage: {
    consumedUnits: number;
    budgetUnits: number;
    usagePercent: number;
  };
}

export async function handleGetSubscription(
  userId: string,
  env: EnvConfig
): Promise<SubscriptionResponse> {
  const [sub, usageCheck] = await Promise.all([
    getSubscription(userId, env),
    checkUsage(userId, env),
  ]);

  const plan = sub?.plan ?? "free";
  const status = sub?.status ?? "active";
  const billingInterval =
    sub?.billing_interval === "monthly" || sub?.billing_interval === "yearly"
      ? sub.billing_interval
      : null;

  return {
    plan,
    status,
    billingInterval,
    currentPeriodEnd: sub?.current_period_end ?? null,
    usage: {
      consumedUnits: usageCheck.consumedUnits,
      budgetUnits: usageCheck.budgetUnits,
      usagePercent: Math.round(usageCheck.usagePercent * 100) / 100,
    },
  };
}
