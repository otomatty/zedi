/**
 * `resolveWebSearchModel` — pick the LLM model the `web_search` tool should run.
 *
 * `webSearchTool` は provider 内蔵の web 検索 (`useWebSearch` for OpenAI,
 * `useGoogleSearch` for Google) を呼ぶため、Anthropic-only な選択では成立しない。
 * 本ヘルパは次の優先順で model を選ぶ:
 *
 * 1. `process.env.WIKI_COMPOSE_WEB_SEARCH_MODEL_ID` (explicit override; `ai_models.id`)
 *    — 必ず active かつ tier 通過することを DB 側で確認する（coderabbit review #956:
 *    不正な override で `createZediChatModel` が失敗してエラー envelope になる
 *    のを防ぐ）。
 * 2. `ai_models` の active な OpenAI モデルで最安 (`input_cost_units` ASC, `output_cost_units` ASC)
 * 3. `ai_models` の active な Google モデルで最安
 * 4. 何も無ければ `null` を返す（ツール側は empty result + note を返す）。
 *
 * Returns the `ai_models.id` so `createZediChatModel({ modelId })` can validate
 * tier access and resolve the API key uniformly. Centralising the choice in one
 * helper keeps the tool body small and makes the Anthropic-fallback policy
 * easy to revisit.
 *
 * The `tier` argument filters out `tierRequired === "pro"` rows for free users,
 * so a free-tier caller never sees `web_search_unavailable_for_tier` surface as
 * an error — they cleanly fall back to "no results" + note (coderabbit #956).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { aiModels } from "../../../schema/index.js";
import type { Database, UserTier } from "../../../types/index.js";

const ENV_OVERRIDE = "WIKI_COMPOSE_WEB_SEARCH_MODEL_ID";

/**
 * Tier-aware predicate: `free` users only see `tierRequired = "free"` models;
 * `pro` users see both.
 *
 * tier ガード。`free` ユーザは `tierRequired = "free"` のモデルだけ見える。
 */
function tierFilter(tier: UserTier) {
  if (tier === "pro") return undefined;
  return eq(aiModels.tierRequired, "free");
}

/**
 * Resolve the model id used by `webSearchTool`. Returns `null` when no
 * suitable model exists (e.g. Anthropic-only seed, or the env override is
 * not active / not accessible to the caller's tier). Pure read-only DB query.
 */
export async function resolveWebSearchModelId(
  db: Database,
  tier: UserTier,
): Promise<string | null> {
  const override = process.env[ENV_OVERRIDE]?.trim();
  if (override) {
    // Validate the override before returning: it must be active and
    // accessible to the caller's tier, otherwise `createZediChatModel`
    // would throw and surface as an `ok:false` envelope instead of the
    // intended graceful unavailable path.
    // override も active + tier 通過性を DB で検証する。
    const tierClause = tierFilter(tier);
    const [row] = await db
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(
        and(
          eq(aiModels.id, override),
          eq(aiModels.isActive, true),
          ...(tierClause ? [tierClause] : []),
        ),
      )
      .limit(1);
    if (row) return row.id;
    // Override resolved but unusable → fall through to the standard lookup
    // rather than returning the broken id.
    // override が使えない場合は通常検索にフォールバックする。
  }

  const tierClause = tierFilter(tier);
  const rows = await db
    .select({
      id: aiModels.id,
      provider: aiModels.provider,
      inputCostUnits: aiModels.inputCostUnits,
      outputCostUnits: aiModels.outputCostUnits,
    })
    .from(aiModels)
    .where(
      and(
        eq(aiModels.isActive, true),
        inArray(aiModels.provider, ["openai", "google"]),
        ...(tierClause ? [tierClause] : []),
      ),
    )
    .orderBy(asc(aiModels.inputCostUnits), asc(aiModels.outputCostUnits));

  if (rows.length === 0) return null;

  // Prefer OpenAI only among cheapest rows (cost tie-break), since `useWebSearch`
  // is well-tested in `aiProviders.ts`.
  // 最安行の中でのみ OpenAI を優先（`aiProviders.ts` の useWebSearch 経路が安定）。
  const cheapestInput = rows[0].inputCostUnits;
  const cheapestOutput = rows[0].outputCostUnits;
  const cheapest = rows.filter(
    (r) => r.inputCostUnits === cheapestInput && r.outputCostUnits === cheapestOutput,
  );
  const preferred = cheapest.find((r) => r.provider === "openai") ?? cheapest[0];
  return preferred?.id ?? null;
}
