/**
 * Pre-flight BYOK checks for Wiki Compose session creation (#951).
 * Wiki Compose セッション作成前の BYOK 事前チェック（#951）。
 *
 * Static env model ids are not validated here — provider matching is enforced at
 * runtime via {@link resolveComposeModelId}. This function only verifies that
 * the user has a stored credential when the graph will call an LLM.
 *
 * 静的 env モデル id との provider 照合は行わない。実行時の
 * `resolveComposeModelId` が provider 整合を担保する。本関数は LLM を呼ぶ
 * グラフで credential が存在するかだけを確認する。
 */
import { HTTPException } from "hono/http-exception";
import type { Database, UserTier } from "../../types/index.js";
import { getComposeModelIdsForGraph } from "./composeModelConfig.js";
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

  const expectedProvider = backendToCredentialProvider(input.backend);
  const key = await getUserAiCredentialPlaintext(input.userId, expectedProvider, input.db);
  if (!key?.trim()) {
    throw new HTTPException(400, {
      message: `No API credential configured for backend "${input.backend}"`,
    });
  }
}
