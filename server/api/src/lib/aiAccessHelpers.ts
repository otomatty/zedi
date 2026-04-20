/**
 * AI モデルアクセス検証のエラーハンドリングヘルパー。
 * Helpers for translating AI model access validation errors into HTTP 4xx responses.
 *
 * `validateModelAccess()` は `"FORBIDDEN"` や `"Model not found or inactive"`
 * などを throw するが、そのままだと 500 になってしまうため、適切な HTTP 例外に
 * 変換するユーティリティを提供する。
 *
 * `validateModelAccess()` throws errors like `"FORBIDDEN"` or
 * `"Model not found or inactive"`. Without translation they surface as 500s.
 * This utility maps them to proper client-facing 4xx exceptions.
 */
import { HTTPException } from "hono/http-exception";
import { checkUsage, validateModelAccess } from "../services/usageService.js";
import { getProviderApiKeyName } from "../services/aiProviders.js";
import { getUserTier } from "../services/subscriptionService.js";
import type { AIProviderType, Database, UserTier } from "../types/index.js";

/**
 * `validateModelAccess()` を呼び、既知のエラーは適切な HTTPException に変換する。
 * Calls `validateModelAccess()` and translates known errors into proper HTTPExceptions.
 *
 * @param modelId - 検証対象のモデル ID / Model ID to validate
 * @param tier - ユーザーの tier / User tier
 * @param db - DB インスタンス / Database instance
 * @returns validateModelAccess の結果 / Result from validateModelAccess
 * @throws HTTPException(403) "FORBIDDEN" の場合 / On "FORBIDDEN"
 * @throws HTTPException(400) "Model not found or inactive" の場合 / On model not found
 */
export async function validateModelAccessOrThrow(
  modelId: string,
  tier: UserTier,
  db: Database,
): Promise<Awaited<ReturnType<typeof validateModelAccess>>> {
  try {
    return await validateModelAccess(modelId, tier, db);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "FORBIDDEN") {
      throw new HTTPException(403, { message: "Model not available for this tier" });
    }
    if (message === "Model not found or inactive") {
      throw new HTTPException(400, { message });
    }
    throw err;
  }
}

/**
 * 現在サポートしている AI プロバイダー一覧。
 * Set of AI providers currently supported by API endpoints accepting
 * `provider` / `model` parameters (clip, ext, ingest, ...).
 */
export const SUPPORTED_AI_PROVIDERS: readonly AIProviderType[] = [
  "openai",
  "anthropic",
  "google",
] as const;

/**
 * 解決済みの AI 設定。
 * Resolved AI configuration: provider/apiModelId は DB 上のレコードから来る
 * （クライアント入力ではない）ので、呼び出し側はそのままプロバイダー呼び出しに
 * 渡してよい。
 *
 * Resolved AI config – `provider` / `apiModelId` come from the DB record
 * (not the client input) so callers can pass them straight to provider calls.
 */
export interface ResolvedAiConfig {
  provider: AIProviderType;
  apiModelId: string;
  apiKey: string;
  /**
   * 内部 composite モデル ID（`aiModels.id`）。クライアント入力をトリムした後の値で、
   * `aiUsageLogs.modelId` の FK に対応する。`recordUsage()` にはこちらを渡す。
   *
   * Internal composite model ID (`aiModels.id`) – the trimmed client input that
   * matches the FK target of `aiUsageLogs.modelId`. Pass this to `recordUsage()`.
   */
  internalModelId: string;
  /**
   * 解決時に取得した呼び出しユーザーの tier。
   * 呼び出し側で usage 記録のために再度 `getUserTier` を呼ばずに済むよう公開する。
   *
   * Caller's tier captured during resolution. Exposed so usage-recording paths
   * don't need to re-query `getUserTier`.
   */
  tier: UserTier;
  /**
   * 解決時に取得したモデル情報（コスト単価など）。
   * `validateModelAccess()` の戻り値そのもので、cost 計算に再利用できる。
   *
   * Model info captured during resolution (cost units, provider, etc.).
   * Reused for cost calculation without re-calling `validateModelAccess`.
   */
  modelInfo: Awaited<ReturnType<typeof validateModelAccess>>;
}

/**
 * `provider` / `model` を受け付けるエンドポイント共通の検証・解決処理。
 * Shared validation/resolution for endpoints that accept `provider` / `model`
 * (clip.ts /youtube, ext.ts /clip-and-create, ...).
 *
 * 1. provider / model は両方指定するか両方省略するかのどちらかを強制する。
 * 2. provider はサポート一覧に含まれている必要がある。
 * 3. tier ベースのモデルアクセス・月次予算チェック。
 * 4. DB 上の provider / apiModelId を「正」として返し、対応する API キーを
 *    環境変数から取り出す。
 *
 * 1. require provider/model to be specified together,
 * 2. ensure the provider is supported,
 * 3. enforce tier-based model access and monthly budget,
 * 4. return the canonical provider/apiModelId from the DB along with the
 *    resolved env-var API key.
 *
 * @param input.userId - 呼び出しユーザー ID / Calling user id
 * @param input.db - Drizzle DB instance
 * @param input.provider - クライアント指定の provider（任意） / Client-supplied provider (optional)
 * @param input.model - クライアント指定の model（任意） / Client-supplied model (optional)
 * @returns provider/model が指定されていれば {@link ResolvedAiConfig}、未指定なら null
 */
export async function resolveAiConfigForRequest(input: {
  userId: string;
  db: Database;
  provider: string | undefined;
  model: string | undefined;
}): Promise<ResolvedAiConfig | null> {
  const { userId, db, provider, model } = input;
  const hasProvider = typeof provider === "string" && provider.trim().length > 0;
  const hasModel = typeof model === "string" && model.trim().length > 0;
  if (hasProvider !== hasModel) {
    throw new HTTPException(400, {
      message: "provider and model must be specified together",
    });
  }
  if (!hasProvider || !hasModel) return null;

  const providerInput = (provider as string).trim() as AIProviderType;
  const modelInput = (model as string).trim();
  if (!SUPPORTED_AI_PROVIDERS.includes(providerInput)) {
    throw new HTTPException(400, { message: `unsupported provider: ${providerInput}` });
  }

  const tier = await getUserTier(userId, db);
  const modelInfo = await validateModelAccessOrThrow(modelInput, tier, db);
  const usageCheck = await checkUsage(userId, tier, db);
  if (!usageCheck.allowed) {
    throw new HTTPException(429, { message: "Monthly budget exceeded" });
  }

  // DB 上の provider を「正」とする（API キー取得もこちらに合わせる）。
  // Trust the DB-resolved provider over the client's input (and fetch the
  // matching env API key) so a client can't request a provider mismatch.
  const resolvedProvider = modelInfo.provider as AIProviderType;
  const resolvedApiModelId = modelInfo.apiModelId;
  const apiKeyName = getProviderApiKeyName(resolvedProvider);
  const apiKey = process.env[apiKeyName];
  if (!apiKey) {
    throw new HTTPException(503, { message: `API key not configured: ${apiKeyName}` });
  }

  return {
    provider: resolvedProvider,
    apiModelId: resolvedApiModelId,
    apiKey,
    internalModelId: modelInput,
    tier,
    modelInfo,
  };
}
