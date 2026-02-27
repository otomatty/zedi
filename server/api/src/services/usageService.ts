import { eq, and, sql } from "drizzle-orm";
import { aiModels, aiUsageLogs, aiMonthlyUsage, aiTierBudgets } from "../schema/index.js";
import type { Database, UserTier, UsageCheckResult, TokenUsage } from "../types/index.js";

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function checkUsage(
  userId: string,
  tier: UserTier,
  db: Database,
): Promise<UsageCheckResult> {
  const yearMonth = currentYearMonth();

  const budgetRow = await db
    .select({ monthlyBudgetUnits: aiTierBudgets.monthlyBudgetUnits })
    .from(aiTierBudgets)
    .where(eq(aiTierBudgets.tier, tier))
    .limit(1);

  const budgetUnits = budgetRow[0]?.monthlyBudgetUnits ?? (tier === "pro" ? 100000 : 10000);

  const usageRow = await db
    .select({ totalCostUnits: aiMonthlyUsage.totalCostUnits })
    .from(aiMonthlyUsage)
    .where(and(eq(aiMonthlyUsage.userId, userId), eq(aiMonthlyUsage.yearMonth, yearMonth)))
    .limit(1);

  const consumedUnits = Number(usageRow[0]?.totalCostUnits ?? 0);
  const remaining = Math.max(budgetUnits - consumedUnits, 0);
  const usagePercent = budgetUnits > 0 ? (consumedUnits / budgetUnits) * 100 : 0;

  return {
    allowed: consumedUnits < budgetUnits,
    usagePercent,
    remaining,
    tier,
    budgetUnits,
    consumedUnits,
  };
}

export async function validateModelAccess(
  modelId: string,
  tier: UserTier,
  db: Database,
): Promise<{
  provider: string;
  apiModelId: string;
  inputCostUnits: number;
  outputCostUnits: number;
}> {
  const model = await db
    .select()
    .from(aiModels)
    .where(and(eq(aiModels.id, modelId), eq(aiModels.isActive, true)))
    .limit(1);

  if (!model.length) {
    throw new Error("Model not found or inactive");
  }

  const m = model[0];
  if (!m) throw new Error("Model not found or inactive");
  if (m.tierRequired === "pro" && tier === "free") {
    throw new Error("FORBIDDEN");
  }

  return {
    provider: m.provider,
    apiModelId: m.modelId,
    inputCostUnits: m.inputCostUnits,
    outputCostUnits: m.outputCostUnits,
  };
}

export function calculateCost(
  usage: TokenUsage,
  inputCostUnits: number,
  outputCostUnits: number,
): number {
  return Math.ceil(
    (usage.inputTokens / 1000) * inputCostUnits + (usage.outputTokens / 1000) * outputCostUnits,
  );
}

export async function recordUsage(
  userId: string,
  modelId: string,
  feature: string,
  usage: TokenUsage,
  costUnits: number,
  apiMode: "system" | "user_key",
  db: Database,
): Promise<void> {
  const yearMonth = currentYearMonth();

  await db.insert(aiUsageLogs).values({
    userId,
    modelId,
    feature,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUnits,
    apiMode,
  });

  await db
    .insert(aiMonthlyUsage)
    .values({
      userId,
      yearMonth,
      totalCostUnits: costUnits,
      requestCount: 1,
    })
    .onConflictDoUpdate({
      target: [aiMonthlyUsage.userId, aiMonthlyUsage.yearMonth],
      set: {
        totalCostUnits: sql`${aiMonthlyUsage.totalCostUnits} + ${costUnits}`,
        requestCount: sql`${aiMonthlyUsage.requestCount} + 1`,
        updatedAt: new Date(),
      },
    });
}
