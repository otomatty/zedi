/**
 * Pre-flight BYOK checks for Wiki Compose session creation (#951).
 * Wiki Compose セッション作成前の BYOK 事前チェック（#951）。
 *
 * Wiki Compose uses a fixed Google model at runtime ({@link WIKI_COMPOSE_MODEL_ID}).
 * Non-Google BYOK backends are rejected at session create to avoid runtime
 * `BackendProviderMismatchError` in `createZediChatModel`.
 *
 * Wiki Compose は Google 固定モデルを使う。`user_anthropic` / `user_openai` など
 * provider が合わない BYOK はセッション作成時に 400 で弾く。
 */
import { HTTPException } from "hono/http-exception";
import type { Database, UserTier } from "../../types/index.js";
import { getComposeModelIdsForGraph } from "./composeModelConfig.js";
import { isFixedWikiComposeModelGraph, WIKI_COMPOSE_MODEL_ID } from "./llm/wikiComposeModelId.js";
import {
  backendToCredentialProvider,
  isUserByokBackend,
  type ExecutionBackend,
} from "./types/executionBackend.js";
import { getUserAiCredentialPlaintext } from "../../services/userAiCredentialService.js";

/**
 * Ensure a BYOK backend has stored credentials when the target graph uses LLMs.
 * LLM を使うグラフ向け BYOK backend に credential が存在するか検証する。
 */
export async function assertComposeBackendReady(input: {
  backend: ExecutionBackend;
  graphId: string;
  userId: string;
  tier: UserTier;
  db: Database;
}): Promise<void> {
  if (!isUserByokBackend(input.backend)) return;

  const modelIds = getComposeModelIdsForGraph(input.graphId);
  // Model-less graphs (e.g. wiki-maintenance) never call `createZediChatModel`.
  // LLM を呼ばないグラフ（wiki-maintenance 等）は credential 不要。
  if (modelIds.length === 0) return;

  if (isFixedWikiComposeModelGraph(input.graphId) && input.backend !== "user_google") {
    throw new HTTPException(400, {
      message: `Wiki Compose requires zedi_managed or user_google backend (fixed model ${WIKI_COMPOSE_MODEL_ID})`,
    });
  }

  const expectedProvider = backendToCredentialProvider(input.backend);
  const key = await getUserAiCredentialPlaintext(input.userId, expectedProvider, input.db);
  if (!key?.trim()) {
    throw new HTTPException(400, {
      message: `No API credential configured for backend "${input.backend}"`,
    });
  }
}
