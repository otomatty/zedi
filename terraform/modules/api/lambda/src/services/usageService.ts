/**
 * AI 使用量サービス — コスト計算・予算チェック・使用量記録
 */
import { eq, and, sql } from "drizzle-orm";
import { aiModels, aiUsageLogs, aiMonthlyUsage, aiTierBudgets } from "../schema";
import type { Database, UserTier, UsageCheckResult, TokenUsage } from "../types";

/**
 * 現在の年月文字列 (例: "2026-07")
 */
function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * ユーザーの使用量を確認し、予算内かチェック
 */
export async function checkUsage(
  userId: string,
  tier: UserTier,
  db: Database,
): Promise<UsageCheckResult> {
  const yearMonth = currentYearMonth();

  // 月間予算取得
  const budgetRow = await db
    .select({ monthlyBudgetUnits: aiTierBudgets.monthlyBudgetUnits })
    .from(aiTierBudgets)
    .where(eq(aiTierBudgets.tier, tier))
    .limit(1);

  const budgetUnits = budgetRow[0]?.monthlyBudgetUnits ?? (tier === "pro" ? 100000 : 10000);

  // 月間使用量取得
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

/**
 * モデル情報を取得し、ユーザーのティアでアクセス可能か検証
 */
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

/**
 * コストユニットを計算
 */
export function calculateCost(
  usage: TokenUsage,
  inputCostUnits: number,
  outputCostUnits: number,
): number {
  return Math.ceil(
    (usage.inputTokens / 1000) * inputCostUnits + (usage.outputTokens / 1000) * outputCostUnits,
  );
}

/**
 * 使用量を記録し、月間サマリーを更新
 */
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

  // 使用ログ INSERT
  await db.insert(aiUsageLogs).values({
    userId,
    modelId,
    feature,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUnits,
    apiMode,
  });

  // 月間サマリー UPSERT
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
