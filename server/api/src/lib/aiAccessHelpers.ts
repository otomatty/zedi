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
import { validateModelAccess } from "../services/usageService.js";
import type { Database, UserTier } from "../types/index.js";

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
