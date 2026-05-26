/**
 * Fixed Wiki Compose model id (temporary until per-role / per-backend selection returns).
 * Wiki Compose 用の固定モデル id（将来ロール別選択に戻すまでの暫定）。
 */
import { and, eq } from "drizzle-orm";
import { aiModels } from "../../../schema/index.js";
import type { Database, UserTier } from "../../../types/index.js";
import type { ComposeModelRole } from "./resolveComposeModelId.js";

/**
 * `ai_models.id` used by every Wiki Compose LLM node and the `web_search` tool.
 * すべての Wiki Compose LLM ノードと `web_search` ツールが使う `ai_models.id`。
 */
export const WIKI_COMPOSE_MODEL_ID = "google:gemini-3.5-flash" as const;

function tierFilter(tier: UserTier) {
  if (tier === "pro") return undefined;
  return eq(aiModels.tierRequired, "free");
}

/**
 * When the fixed row exists and is accessible, return it; otherwise still return
 * {@link WIKI_COMPOSE_MODEL_ID} so callers fail consistently in `validateModelAccess`.
 * 行が active かつ tier 的に使えるときだけ DB 上の id を返し、それ以外は固定 id を返す。
 */
async function fixedModelIdIfAccessible(db: Database, tier: UserTier): Promise<string> {
  const tierClause = tierFilter(tier);
  const [row] = await db
    .select({ id: aiModels.id })
    .from(aiModels)
    .where(
      and(
        eq(aiModels.id, WIKI_COMPOSE_MODEL_ID),
        eq(aiModels.isActive, true),
        ...(tierClause ? [tierClause] : []),
      ),
    )
    .limit(1);
  return row?.id ?? WIKI_COMPOSE_MODEL_ID;
}

/**
 * Resolve the model row id for Wiki Compose orchestrator / draft / research nodes.
 * `role` is accepted for API stability; all roles map to {@link WIKI_COMPOSE_MODEL_ID} for now.
 *
 * Wiki Compose の model id 解決。現時点では role に関わらず gemini-3.5-flash 固定。
 */
export async function resolveWikiComposeModelId(
  _role: ComposeModelRole,
  _tier: UserTier,
  db: Database,
): Promise<string> {
  return fixedModelIdIfAccessible(db, _tier);
}
