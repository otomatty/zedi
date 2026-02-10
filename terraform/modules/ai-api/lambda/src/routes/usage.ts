/**
 * Usage route handler — returns current month's AI usage for the user
 */

import type { EnvConfig } from "../types/index.js";
import { checkUsage } from "../services/usageService.js";

export async function handleGetUsage(
  userId: string,
  env: EnvConfig
): Promise<{
  usagePercent: number;
  consumedUnits: number;
  budgetUnits: number;
  remaining: number;
  tier: string;
  yearMonth: string;
}> {
  const result = await checkUsage(userId, env);
  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  return {
    usagePercent: Math.round(result.usagePercent * 100) / 100, // 2 decimal places
    consumedUnits: result.consumedUnits,
    budgetUnits: result.budgetUnits,
    remaining: result.remaining,
    tier: result.tier,
    yearMonth,
  };
}
