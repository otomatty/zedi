/**
 * 各LLMプロバイダー（OpenAI / Anthropic / Google）からモデル一覧を取得し、
 * ai_models テーブルを更新する。
 * OpenRouter API から料金を取得してモデル別 Cost Units を自動設定する（OPENROUTER_API_KEY 設定時）。
 *
 * 実行: npm run sync:ai-models (要 DATABASE_URL と各プロバイダーの API キー)
 *
 * 環境変数（任意）:
 *   OPENROUTER_API_KEY OpenRouter の API キー（未設定時は全モデル DEFAULT_COST_UNITS）
 *   OPENAI_MODEL_IDS  カンマ区切りで登録するモデルIDのみ（未設定なら取得した全件を登録）
 *   GOOGLE_MODEL_IDS  同上（例: gemini-2.0-flash,gemini-1.5-pro）
 *
 * Anthropic: https://docs.anthropic.com/en/api/models-list の data 配列を使用
 */
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { AIProviderType } from "../types/index.js";
import { getProviderApiKeyName } from "./aiProviders.js";
import { getOptionalEnv } from "../lib/env.js";
import { getDb } from "../db/client.js";
import { aiModels } from "../schema/index.js";
import type {
  Row,
  SyncResult,
  SyncPreviewResult,
  SyncPreviewItem,
  OpenRouterPricing,
} from "./syncAiModelsTypes.js";
import {
  isTextChatModel,
  isLatestGeneration,
  isSonnetModel,
  parseAllowlist,
} from "./syncAiModelsFilters.js";
import { fetchOpenAIModels, fetchAnthropicModels, fetchGoogleModels } from "./syncAiModelsFetch.js";
import {
  fetchOpenRouterPricing,
  findReferencePricePerToken,
  findPricing,
  lookupOpenRouterKeys,
  calculateCostUnits,
} from "./syncAiModelsPricing.js";

// Re-export types for routes and scripts
export type {
  SyncResult,
  SyncPreviewResult,
  SyncPreviewItem,
  SyncedModelInfo,
} from "./syncAiModelsTypes.js";

/**
 * 1 プロバイダー分のモデル行を取得し、フィルタ・allowlist を適用する。
 */
async function fetchAndFilterRows(
  provider: AIProviderType,
  apiKey: string,
): Promise<{ rows: Row[]; totalBeforeFilter: number; debug?: string }> {
  let rows: Row[];
  let debug: string | undefined;

  switch (provider) {
    case "openai":
      rows = await fetchOpenAIModels(apiKey);
      break;
    case "anthropic": {
      const result = await fetchAnthropicModels(apiKey);
      rows = result.rows;
      debug = result.debug;
      break;
    }
    case "google":
      rows = await fetchGoogleModels(apiKey);
      break;
    default:
      rows = [];
  }

  const totalBeforeFilter = rows.length;
  rows = rows.filter(
    (r) => isTextChatModel(r.provider, r.modelId) && isLatestGeneration(r.provider, r.modelId),
  );

  const openaiAllowlist = parseAllowlist(getOptionalEnv("OPENAI_MODEL_IDS"));
  const googleAllowlist = parseAllowlist(getOptionalEnv("GOOGLE_MODEL_IDS"));
  if (provider === "openai" && openaiAllowlist !== null) {
    rows = rows.filter((r) => openaiAllowlist.has(r.modelId));
  }
  if (provider === "google" && googleAllowlist !== null) {
    rows = rows.filter((r) => googleAllowlist.has(r.modelId));
  }

  return { rows, totalBeforeFilter, debug };
}

export async function previewSyncAiModels(
  db: ReturnType<typeof getDb>,
): Promise<SyncPreviewResult[]> {
  const results: SyncPreviewResult[] = [];
  const providers: AIProviderType[] = ["openai", "anthropic", "google"];

  for (const provider of providers) {
    const keyName = getProviderApiKeyName(provider);
    const apiKey = getOptionalEnv(keyName);
    if (!apiKey) {
      results.push({ provider, toAdd: [], toDeactivate: [], error: `${keyName} not set` });
      continue;
    }

    try {
      const { rows } = await fetchAndFilterRows(provider, apiKey);

      const existingRows = await db
        .select({
          id: aiModels.id,
          provider: aiModels.provider,
          modelId: aiModels.modelId,
          displayName: aiModels.displayName,
          tierRequired: aiModels.tierRequired,
          isActive: aiModels.isActive,
        })
        .from(aiModels)
        .where(eq(aiModels.provider, provider));
      const existingIds = new Set(existingRows.map((r) => r.id));
      const fetchedIds = new Set(rows.map((row) => row.id));

      const toAdd: SyncPreviewItem[] = [];
      for (const row of rows) {
        if (existingIds.has(row.id)) continue;
        const isActive = isSonnetModel(row.provider, row.modelId) ? false : row.isActive;
        toAdd.push({
          id: row.id,
          provider: row.provider,
          modelId: row.modelId,
          displayName: row.displayName,
          tierRequired: row.tierRequired,
          isActive,
        });
      }
      const toDeactivate = existingRows
        .filter((row) => row.isActive && !fetchedIds.has(row.id))
        .map((row) => ({
          id: row.id,
          provider: row.provider,
          modelId: row.modelId,
          displayName: row.displayName,
          tierRequired: row.tierRequired,
          isActive: false,
        }));
      results.push({ provider, toAdd, toDeactivate });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const message = err.message + (err.cause ? ` (cause: ${String(err.cause)})` : "");
      results.push({ provider, toAdd: [], toDeactivate: [], error: message });
    }
  }
  return results;
}

/**
 * 1 プロバイダー分の同期を実行し、結果を返す。
 */
async function syncOneProvider(
  db: ReturnType<typeof getDb>,
  provider: AIProviderType,
  apiKey: string,
  pricingMap: Map<string, OpenRouterPricing>,
  basePricePerToken: number,
): Promise<SyncResult> {
  const { rows, totalBeforeFilter, debug } = await fetchAndFilterRows(provider, apiKey);
  const fetchedTotal = totalBeforeFilter;

  // OpenRouter 料金から Cost Units を適用
  if (pricingMap.size > 0 && basePricePerToken > 0) {
    for (const row of rows) {
      const keys = lookupOpenRouterKeys(provider, row.modelId);
      const pricing = findPricing(pricingMap, keys);
      if (pricing) {
        const cu = calculateCostUnits(pricing, basePricePerToken);
        row.inputCostUnits = cu.input;
        row.outputCostUnits = cu.output;
      }
    }
  }

  const existingRows = await db
    .select({ id: aiModels.id })
    .from(aiModels)
    .where(eq(aiModels.provider, provider));
  const existingIds = new Set(existingRows.map((r) => r.id));

  const [maxRow] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${aiModels.sortOrder}), 0)` })
    .from(aiModels);
  let nextSortOrder = Number(maxRow?.maxOrder ?? 0) + 1;

  let upserted = 0;
  for (const row of rows) {
    if (existingIds.has(row.id)) continue;

    const isActive = isSonnetModel(row.provider, row.modelId) ? false : row.isActive;

    const inserted = await db
      .insert(aiModels)
      .values({
        id: row.id,
        provider: row.provider,
        modelId: row.modelId,
        displayName: row.displayName,
        tierRequired: row.tierRequired,
        inputCostUnits: row.inputCostUnits,
        outputCostUnits: row.outputCostUnits,
        isActive,
        sortOrder: nextSortOrder,
      })
      .onConflictDoNothing({ target: aiModels.id })
      .returning({ id: aiModels.id });
    if (inserted.length > 0) {
      upserted += 1;
      nextSortOrder += 1;
    }
  }

  const fetchedIds = rows.map((row) => row.id);
  let deactivated = 0;
  if (fetchedIds.length > 0) {
    const result = await db
      .update(aiModels)
      .set({ isActive: false })
      .where(
        and(
          eq(aiModels.provider, provider),
          eq(aiModels.isActive, true),
          notInArray(aiModels.id, fetchedIds),
        ),
      );
    deactivated = result.rowCount ?? 0;
  } else {
    const result = await db
      .update(aiModels)
      .set({ isActive: false })
      .where(and(eq(aiModels.provider, provider), eq(aiModels.isActive, true)));
    deactivated = result.rowCount ?? 0;
  }

  const hasPricing = pricingMap.size > 0 && basePricePerToken > 0;
  return {
    provider,
    fetched: fetchedTotal,
    filtered: fetchedTotal - rows.length,
    upserted,
    deactivated,
    pricingSource: hasPricing ? "openrouter" : "default",
    models: rows.map((r) => ({
      id: r.id,
      modelId: r.modelId,
      inputCostUnits: r.inputCostUnits,
      outputCostUnits: r.outputCostUnits,
    })),
    debug,
  };
}

export async function syncAiModels(db: ReturnType<typeof getDb>): Promise<SyncResult[]> {
  const pricingMap = await fetchOpenRouterPricing();
  const basePricePerToken = findReferencePricePerToken(pricingMap);

  const results: SyncResult[] = [];
  const providers: AIProviderType[] = ["openai", "anthropic", "google"];

  for (const provider of providers) {
    const keyName = getProviderApiKeyName(provider);
    const apiKey = getOptionalEnv(keyName);
    if (!apiKey) {
      results.push({ provider, fetched: 0, upserted: 0, error: `${keyName} not set` });
      continue;
    }

    try {
      const result = await syncOneProvider(db, provider, apiKey, pricingMap, basePricePerToken);
      results.push(result);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const message = err.message + (err.cause ? ` (cause: ${String(err.cause)})` : "");
      console.error(`[syncAiModels] ${provider} error:`, err.message, err.cause ?? err);
      results.push({ provider, fetched: 0, upserted: 0, error: message });
    }
  }

  return results;
}
