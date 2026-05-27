/**
 * Resolve `ai_models.id` for non–Wiki Compose graphs (e.g. ingest planner).
 * Wiki Compose uses {@link resolveWikiComposeModelId} instead.
 *
 * Wiki Compose 以外（ingest planner 等）向けの model id 解決。
 */
import { and, asc, eq } from "drizzle-orm";
import { aiModels } from "../../../schema/index.js";
import type { Database, UserTier } from "../../../types/index.js";
import {
  backendToCredentialProvider,
  isUserByokBackend,
  type ExecutionBackend,
} from "../types/executionBackend.js";
import type { UserAiCredentialProvider } from "../../../schema/userAiCredentials.js";

/** Orchestrator nodes (plan / evaluate / refine / brief / structure). */
export type ComposeModelRole = "orchestrator" | "draft";

const ROLE_ENV: Record<ComposeModelRole, string> = {
  orchestrator: "WIKI_COMPOSE_ORCHESTRATOR_MODEL_ID",
  draft: "WIKI_COMPOSE_DRAFT_MODEL_ID",
};

/** Static fallbacks when the DB has no active row (dev / smoke tests). */
const ROLE_FALLBACK: Record<
  ComposeModelRole,
  Record<UserAiCredentialProvider, string> & { default: string }
> = {
  orchestrator: {
    anthropic: "claude-3-5-haiku",
    openai: "openai:gpt-4o-mini",
    google: "google:gemini-2.0-flash",
    default: "claude-3-5-haiku",
  },
  draft: {
    anthropic: "claude-3-5-sonnet",
    openai: "openai:gpt-4o-mini",
    google: "google:gemini-2.0-flash",
    default: "claude-3-5-sonnet",
  },
};

function tierFilter(tier: UserTier) {
  if (tier === "pro") return undefined;
  return eq(aiModels.tierRequired, "free");
}

async function modelIdIfAccessible(
  db: Database,
  tier: UserTier,
  modelId: string,
  requiredProvider: UserAiCredentialProvider | null,
): Promise<string | null> {
  const tierClause = tierFilter(tier);
  const [row] = await db
    .select({ id: aiModels.id, provider: aiModels.provider })
    .from(aiModels)
    .where(
      and(
        eq(aiModels.id, modelId),
        eq(aiModels.isActive, true),
        ...(tierClause ? [tierClause] : []),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (requiredProvider && row.provider !== requiredProvider) return null;
  return row.id;
}

async function cheapestActiveModelId(
  db: Database,
  tier: UserTier,
  provider: UserAiCredentialProvider,
): Promise<string | null> {
  const tierClause = tierFilter(tier);
  const [row] = await db
    .select({ id: aiModels.id })
    .from(aiModels)
    .where(
      and(
        eq(aiModels.isActive, true),
        eq(aiModels.provider, provider),
        ...(tierClause ? [tierClause] : []),
      ),
    )
    .orderBy(asc(aiModels.inputCostUnits), asc(aiModels.outputCostUnits))
    .limit(1);
  return row?.id ?? null;
}

function requiredProvider(backend: ExecutionBackend): UserAiCredentialProvider | null {
  if (isUserByokBackend(backend)) {
    return backendToCredentialProvider(backend);
  }
  return null;
}

/**
 * Pick an `ai_models.id` for orchestrator or draft nodes.
 * BYOK: provider must match the session backend; `zedi_managed`: env override or Anthropic default.
 */
export async function resolveComposeModelId(
  role: ComposeModelRole,
  backend: ExecutionBackend,
  tier: UserTier,
  db: Database,
): Promise<string> {
  const provider = requiredProvider(backend);
  const envOverride = process.env[ROLE_ENV[role]]?.trim();
  if (envOverride) {
    const resolved = await modelIdIfAccessible(db, tier, envOverride, provider);
    if (resolved) return resolved;
  }

  if (provider) {
    const fromDb = await cheapestActiveModelId(db, tier, provider);
    if (fromDb) return fromDb;
    return ROLE_FALLBACK[role][provider];
  }

  return ROLE_FALLBACK[role].default;
}
