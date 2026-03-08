/**
 * AI モデル同期: OpenRouter 料金取得と Cost Units 計算
 */
import type { AIProviderType } from "../types/index.js";
import { getOptionalEnv } from "../lib/env.js";
import { fetchWithTimeout } from "./syncAiModelsFetch.js";
import type { OpenRouterPricing, OpenRouterModel } from "./syncAiModelsTypes.js";

/**
 * OpenRouter API から全モデルの料金データを取得する。
 * OPENROUTER_API_KEY が未設定の場合は空の Map を返す。
 */
export async function fetchOpenRouterPricing(): Promise<Map<string, OpenRouterPricing>> {
  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.warn(
      "[syncAiModels] OPENROUTER_API_KEY not set; all models will use DEFAULT_COST_UNITS.",
    );
    return new Map();
  }

  try {
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.warn(
        `[syncAiModels] OpenRouter API failed: ${res.status}; using DEFAULT_COST_UNITS.`,
      );
      return new Map();
    }

    const data = (await res.json()) as { data?: OpenRouterModel[] };
    const list = data.data ?? [];
    const map = new Map<string, OpenRouterPricing>();
    for (const m of list) {
      if (m.id && m.pricing) {
        map.set(m.id, m.pricing);
      }
    }
    return map;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.warn(
      "[syncAiModels] OpenRouter fetch error:",
      err.message,
      "; using DEFAULT_COST_UNITS.",
    );
    return new Map();
  }
}

/**
 * プロバイダー API のモデル ID を OpenRouter のキー形式の候補リストに変換する。
 */
export function lookupOpenRouterKeys(provider: AIProviderType, modelId: string): string[] {
  const providerPrefix = provider === "google" ? "google" : provider;
  const primary = `${providerPrefix}/${modelId}`;
  const keys = [primary];

  const versionMatch = modelId.match(/^(.+)-(\d+)-(\d+(?:-\d+)*)$/);
  if (versionMatch && versionMatch[1] && versionMatch[2] && versionMatch[3]) {
    const dotVersion = `${versionMatch[1]}-${versionMatch[2]}.${versionMatch[3].replace(/-/g, ".")}`;
    keys.push(`${providerPrefix}/${dotVersion}`);
  }

  return keys;
}

/**
 * OpenRouter の pricingMap からモデルの料金を検索する。
 */
export function findPricing(
  pricingMap: Map<string, OpenRouterPricing>,
  candidateKeys: string[],
): OpenRouterPricing | undefined {
  for (const key of candidateKeys) {
    const exact = pricingMap.get(key);
    if (exact) return exact;
  }

  for (const key of candidateKeys) {
    for (const [mapKey, pricing] of pricingMap) {
      if (mapKey.startsWith(key + "-") || mapKey.startsWith(key + "/")) return pricing;
    }
  }
  return undefined;
}

const REFERENCE_MODEL_KEYS = [
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-4.6-sonnet",
  "anthropic/claude-sonnet-4-6",
];
const REFERENCE_CU = 100;
const DEFAULT_COST_UNITS = 1;

/**
 * 基準モデルの input 料金を参照価格として返す。
 * 基準モデルが見つからない場合は OpenRouter 全モデルの中央値にフォールバックする。
 */
export function findReferencePricePerToken(pricingMap: Map<string, OpenRouterPricing>): number {
  for (const key of REFERENCE_MODEL_KEYS) {
    const pricing = pricingMap.get(key);
    if (pricing) {
      const p = parseFloat(pricing.prompt);
      if (Number.isFinite(p) && p > 0) return p;
    }
  }

  const prices: number[] = [];
  for (const [, pricing] of pricingMap) {
    const p = parseFloat(pricing.prompt);
    if (Number.isFinite(p) && p > 0) prices.push(p);
  }
  if (prices.length === 0) return 0;
  prices.sort((a, b) => a - b);
  return prices[Math.floor(prices.length / 2)] ?? 0;
}

/**
 * 料金（USD per token）から相対的な Cost Units を計算する。
 */
export function calculateCostUnits(
  pricing: OpenRouterPricing,
  referencePricePerToken: number,
): { input: number; output: number } {
  const inputPrice = parseFloat(pricing.prompt) || 0;
  const outputPrice = parseFloat(pricing.completion) || 0;

  if (referencePricePerToken <= 0) return { input: DEFAULT_COST_UNITS, output: DEFAULT_COST_UNITS };

  return {
    input: Math.max(1, Math.round((inputPrice / referencePricePerToken) * REFERENCE_CU)),
    output: Math.max(1, Math.round((outputPrice / referencePricePerToken) * REFERENCE_CU)),
  };
}
