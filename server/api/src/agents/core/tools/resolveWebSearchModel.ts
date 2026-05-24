/**
 * `resolveWebSearchModel` — pick the LLM model the `web_search` tool should run.
 *
 * `webSearchTool` は provider 内蔵の web 検索 (`useWebSearch` for OpenAI,
 * `useGoogleSearch` for Google) を呼ぶため、Anthropic-only な選択では成立しない。
 * 本ヘルパは次の優先順で model を選ぶ:
 *
 * 1. `process.env.WIKI_COMPOSE_WEB_SEARCH_MODEL_ID` (explicit override; `ai_models.id`)
 * 2. `ai_models` の active な OpenAI モデルで最安 (`input_cost_units` ASC, `output_cost_units` ASC)
 * 3. `ai_models` の active な Google モデルで最安
 * 4. 何も無ければ `null` を返す（ツール側は empty result + note を返す）。
 *
 * Returns the `ai_models.id` so `createZediChatModel({ modelId })` can validate
 * tier access and resolve the API key uniformly. Centralising the choice in one
 * helper keeps the tool body small and makes the Anthropic-fallback policy
 * easy to revisit.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { aiModels } from "../../../schema/index.js";
import type { Database } from "../../../types/index.js";

const ENV_OVERRIDE = "WIKI_COMPOSE_WEB_SEARCH_MODEL_ID";

/**
 * Resolve the model id used by `webSearchTool`. Returns `null` when no
 * suitable model exists (e.g. Anthropic-only seed). Pure read-only DB query.
 */
export async function resolveWebSearchModelId(db: Database): Promise<string | null> {
  const override = process.env[ENV_OVERRIDE]?.trim();
  if (override) {
    // Trust the env override; `validateModelAccess` (called by the factory)
    // will surface a clear error if the id is bogus or inactive.
    // 環境変数は信頼する。実在性は `validateModelAccess` 側で検証される。
    return override;
  }

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
      ),
    )
    .orderBy(asc(aiModels.inputCostUnits), asc(aiModels.outputCostUnits));

  // Prefer OpenAI when costs tie, since `useWebSearch` (chat completions
  // `web_search_options`) is well-tested in `aiProviders.ts`; Google's
  // `googleSearch` tool is also supported but requires the `tools` payload.
  // 同コストなら OpenAI を優先（`useWebSearch` 経路が安定）。
  const openai = rows.find((r) => r.provider === "openai");
  if (openai) return openai.id;
  const google = rows.find((r) => r.provider === "google");
  if (google) return google.id;
  return null;
}
