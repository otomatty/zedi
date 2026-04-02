/**
 * AI サービス — モデル一覧取得・使用量取得。
 * AI service — model listing and usage fetching.
 */

import type { AIModel, AIUsage, CachedServerModels, UserTier } from "@/types/ai";

/** Uses same base URL as REST API (VITE_API_BASE_URL). */
const getAIAPIBaseUrl = () => (import.meta.env.VITE_API_BASE_URL as string) ?? "";

const SERVER_MODELS_CACHE_KEY = "zedi-ai-server-models";
const SERVER_MODELS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/** API/cache の snake_case または camelCase を AIModel に正規化 */
function normalizeToAIModel(raw: Record<string, unknown>): AIModel {
  const rawTier = (raw.tierRequired ?? raw.tier_required) as string | undefined;
  const tierRequired: UserTier = rawTier === "pro" ? "pro" : "free";
  return {
    id: (raw.id as string) ?? "",
    provider: (raw.provider as AIModel["provider"]) ?? "google",
    modelId: (raw.modelId as string) ?? (raw.model_id as string) ?? "",
    displayName: (raw.displayName as string) ?? (raw.display_name as string) ?? "",
    tierRequired,
    available: (raw.available as boolean) ?? false,
    inputCostUnits: (raw.inputCostUnits as number) ?? (raw.input_cost_units as number) ?? 0,
    outputCostUnits: (raw.outputCostUnits as number) ?? (raw.output_cost_units as number) ?? 0,
  };
}

/**
 * モデル一覧取得失敗時の詳細付きエラー。
 * Error with details when model listing fails.
 */
export class FetchServerModelsError extends Error {
  /**
   * サーバーからモデル一覧を取得できなかったときのエラー。
   * Error thrown when the server model list cannot be fetched.
   *
   * @param message - Human-readable message.
   * @param code - Machine-readable error category.
   * @param details - Optional HTTP / response details.
   */
  constructor(
    message: string,
    public readonly code: "NO_BASE_URL" | "NETWORK" | "HTTP" | "INVALID_RESPONSE",
    public readonly details?: { status?: number; statusText?: string; body?: string },
  ) {
    super(message);
    this.name = "FetchServerModelsError";
  }
}

async function fetchModelsFromApi(
  apiBaseUrl: string,
): Promise<{ models: AIModel[]; tier: string }> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/ai/models`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch (e) {
    const message =
      e instanceof TypeError && e.message.includes("fetch")
        ? `ネットワークエラー: ${apiBaseUrl} に接続できません。CORS または URL を確認してください。`
        : `リクエスト失敗: ${e instanceof Error ? e.message : String(e)}`;
    const err = new FetchServerModelsError(message, "NETWORK", {
      body: e instanceof Error ? e.message : String(e),
    });
    console.error("[fetchServerModels]", message, e);
    throw err;
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (e) {
    const err = new FetchServerModelsError(
      `レスポンスの読み取りに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      "NETWORK",
    );
    console.error("[fetchServerModels]", err.message, e);
    throw err;
  }

  if (!response.ok) {
    const err = new FetchServerModelsError("API エラーが発生しました", "HTTP", {
      status: response.status,
      statusText: response.statusText,
      body: bodyText.slice(0, 500),
    });
    console.error("[fetchServerModels]", {
      status: response.status,
      statusText: response.statusText,
      body: bodyText.slice(0, 500),
    });
    throw err;
  }

  let data: { models?: unknown[]; tier?: UserTier };
  try {
    data = JSON.parse(bodyText) as { models?: unknown[]; tier?: UserTier };
  } catch (_e) {
    const err = new FetchServerModelsError("レスポンスが JSON ではありません", "INVALID_RESPONSE", {
      body: bodyText.slice(0, 500),
    });
    console.error("[fetchServerModels]", { body: bodyText.slice(0, 500) });
    throw err;
  }

  if (!Array.isArray(data.models)) {
    const err = new FetchServerModelsError("API のレスポンス形式が不正です", "INVALID_RESPONSE", {
      body: bodyText.slice(0, 500),
    });
    console.error("[fetchServerModels]", { body: bodyText.slice(0, 500) });
    throw err;
  }

  const models = data.models.map((m) => normalizeToAIModel((m as Record<string, unknown>) ?? {}));
  const tier: UserTier = data.tier === "pro" ? "pro" : "free";
  return { models, tier };
}

/**
 * サーバーから利用可能なモデル一覧を取得（キャッシュあり）。
 * Fetches available models from the server (with cache).
 * @throws {FetchServerModelsError} 取得失敗時（URL未設定・ネットワーク・HTTPエラー・不正レスポンス）
 */
export async function fetchServerModels(forceRefresh = false): Promise<{
  models: AIModel[];
  tier: string;
}> {
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(SERVER_MODELS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedServerModels;
        if (Date.now() - parsed.cachedAt < SERVER_MODELS_CACHE_TTL) {
          const models = (parsed.models ?? []).map((m) =>
            normalizeToAIModel(m as unknown as Record<string, unknown>),
          );
          const rawTier = parsed.tier as string;
          const cachedTier: string = rawTier === "pro" ? "pro" : "free";
          console.debug("[fetchServerModels] cache hit", {
            count: models.length,
            tier: cachedTier,
          });
          return { models, tier: cachedTier };
        }
      }
    } catch (e) {
      console.warn("[fetchServerModels] Cache read/parse failed, fetching from API", e);
    }
  }

  const apiBaseUrl = getAIAPIBaseUrl();
  console.debug("[fetchServerModels] fetching from API", {
    apiBaseUrl: apiBaseUrl || "(empty)",
    url: apiBaseUrl ? `${apiBaseUrl}/api/ai/models` : "(none)",
  });
  if (!apiBaseUrl) {
    const err = new FetchServerModelsError(
      "VITE_API_BASE_URL が設定されていません。.env に API サーバーの URL を設定してください。",
      "NO_BASE_URL",
    );
    console.error("[fetchServerModels]", err.message);
    throw err;
  }

  const result = await fetchModelsFromApi(apiBaseUrl);
  console.debug("[fetchServerModels] API response", {
    count: result.models.length,
    tier: result.tier,
  });

  try {
    localStorage.setItem(
      SERVER_MODELS_CACHE_KEY,
      JSON.stringify({
        models: result.models,
        tier: result.tier as UserTier,
        cachedAt: Date.now(),
      } satisfies CachedServerModels),
    );
  } catch {
    // ignore
  }

  return result;
}

/**
 * サーバーから現在の使用量を取得。
 * Fetches current usage from the server.
 */
export async function fetchUsage(): Promise<AIUsage> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    return {
      usagePercent: 0,
      consumedUnits: 0,
      budgetUnits: 0,
      remaining: 0,
      tier: "free",
      yearMonth: "",
    };
  }

  const response = await fetch(`${apiBaseUrl}/api/ai/usage`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }

  if (!response.ok) {
    throw new Error("Failed to fetch usage");
  }

  return (await response.json()) as AIUsage;
}
