/**
 * Usage tracking service — Cost Unit calculation, budget checks, logging
 */

import { execute } from "../lib/db.js";
import type {
  AIModel,
  EnvConfig,
  MonthlyUsage,
  TokenUsage,
  UsageCheckResult,
} from "../types/index.js";
import { getSubscription } from "./subscriptionService";

// =============================================================================
// Helpers
// =============================================================================

function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// =============================================================================
// Model lookup (cached)
// =============================================================================

let _modelCache: Map<string, AIModel> | null = null;
let _modelCacheAt = 0;
const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadModels(env: EnvConfig): Promise<Map<string, AIModel>> {
  const now = Date.now();
  if (_modelCache && now - _modelCacheAt < MODEL_CACHE_TTL) return _modelCache;

  const rows = await execute<AIModel>(
    "SELECT * FROM ai_models WHERE is_active = TRUE ORDER BY sort_order",
    {},
    env
  );

  _modelCache = new Map(rows.map((r) => [r.id, r]));
  _modelCacheAt = now;
  return _modelCache;
}

export async function getModel(modelId: string, env: EnvConfig): Promise<AIModel> {
  const models = await loadModels(env);
  const model = models.get(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return model;
}

export async function getActiveModels(env: EnvConfig): Promise<AIModel[]> {
  const models = await loadModels(env);
  return Array.from(models.values());
}

// =============================================================================
// Tier budget lookup (cached)
// =============================================================================

let _budgetCache: Map<string, number> | null = null;
let _budgetCacheAt = 0;

async function loadBudgets(env: EnvConfig): Promise<Map<string, number>> {
  const now = Date.now();
  if (_budgetCache && now - _budgetCacheAt < MODEL_CACHE_TTL) return _budgetCache;

  const rows = await execute<{ tier: string; monthly_budget_units: number }>(
    "SELECT tier, monthly_budget_units FROM ai_tier_budgets",
    {},
    env
  );

  _budgetCache = new Map(rows.map((r) => [r.tier, r.monthly_budget_units]));
  _budgetCacheAt = now;
  return _budgetCache;
}

async function getTierBudget(tier: string, env: EnvConfig): Promise<number> {
  const budgets = await loadBudgets(env);
  return budgets.get(tier) ?? 1500; // fallback to free tier
}

// =============================================================================
// Monthly usage lookup
// =============================================================================

async function getMonthlyUsage(
  userId: string,
  env: EnvConfig
): Promise<MonthlyUsage> {
  const yearMonth = getCurrentYearMonth();
  const rows = await execute<MonthlyUsage>(
    `SELECT user_id, year_month, total_cost_units, request_count
     FROM ai_monthly_usage
     WHERE user_id = :userId AND year_month = :yearMonth`,
    { userId, yearMonth },
    env
  );

  if (rows.length > 0) return rows[0];

  return {
    user_id: userId,
    year_month: yearMonth,
    total_cost_units: 0,
    request_count: 0,
  };
}

// =============================================================================
// Usage check (pre-request)
// =============================================================================

export async function checkUsage(
  userId: string,
  env: EnvConfig
): Promise<UsageCheckResult> {
  const subscription = await getSubscription(userId, env);
  const tier = subscription?.plan ?? "free";
  const budgetUnits = await getTierBudget(tier, env);
  const usage = await getMonthlyUsage(userId, env);
  const consumedUnits = Number(usage.total_cost_units);

  return {
    allowed: consumedUnits < budgetUnits,
    usagePercent: budgetUnits > 0 ? (consumedUnits / budgetUnits) * 100 : 100,
    remaining: Math.max(0, budgetUnits - consumedUnits),
    tier,
    budgetUnits,
    consumedUnits,
  };
}

// =============================================================================
// Cost calculation
// =============================================================================

export function calculateCostUnits(
  model: AIModel,
  tokenUsage: TokenUsage
): number {
  return Math.ceil(
    (tokenUsage.inputTokens / 1000) * model.input_cost_units +
    (tokenUsage.outputTokens / 1000) * model.output_cost_units
  );
}

// =============================================================================
// Record usage (post-request)
// =============================================================================

export async function recordUsage(
  params: {
    userId: string;
    modelId: string;
    feature: string;
    tokenUsage: TokenUsage;
    apiMode: "system" | "user_key";
  },
  env: EnvConfig
): Promise<{ costUnits: number; usagePercent: number }> {
  const model = await getModel(params.modelId, env);
  const costUnits = calculateCostUnits(model, params.tokenUsage);
  const yearMonth = getCurrentYearMonth();

  // Insert usage log
  await execute(
    `INSERT INTO ai_usage_logs (user_id, model_id, feature, input_tokens, output_tokens, cost_units, api_mode)
     VALUES (:userId, :modelId, :feature, :inputTokens, :outputTokens, :costUnits, :apiMode)`,
    {
      userId: params.userId,
      modelId: params.modelId,
      feature: params.feature,
      inputTokens: params.tokenUsage.inputTokens,
      outputTokens: params.tokenUsage.outputTokens,
      costUnits,
      apiMode: params.apiMode,
    },
    env
  );

  // Upsert monthly aggregate
  await execute(
    `INSERT INTO ai_monthly_usage (user_id, year_month, total_cost_units, request_count, updated_at)
     VALUES (:userId, :yearMonth, :costUnits, 1, NOW())
     ON CONFLICT (user_id, year_month)
     DO UPDATE SET
       total_cost_units = ai_monthly_usage.total_cost_units + :costUnits,
       request_count = ai_monthly_usage.request_count + 1,
       updated_at = NOW()`,
    { userId: params.userId, yearMonth, costUnits },
    env
  );

  // Return updated usage percent
  const subscription = await getSubscription(params.userId, env);
  const tier = subscription?.plan ?? "free";
  const budgetUnits = await getTierBudget(tier, env);
  const updatedUsage = await getMonthlyUsage(params.userId, env);
  const usagePercent =
    budgetUnits > 0 ? (Number(updatedUsage.total_cost_units) / budgetUnits) * 100 : 100;

  return { costUnits, usagePercent };
}

// =============================================================================
// Model access validation
// =============================================================================

export async function validateModelAccess(
  userId: string,
  modelId: string,
  env: EnvConfig
): Promise<AIModel> {
  const model = await getModel(modelId, env);
  const subscription = await getSubscription(userId, env);
  const userTier = subscription?.plan ?? "free";

  if (model.tier_required === "paid" && userTier !== "paid") {
    throw new Error("MODEL_ACCESS_DENIED");
  }

  return model;
}
