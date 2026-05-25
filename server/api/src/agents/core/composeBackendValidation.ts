/**
 * Validate BYOK backend against compose graph model providers (#951).
 * Compose グラフのモデル provider と BYOK backend の整合を検証する。
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
 * Ensure BYOK backend matches configured compose models and credentials exist.
 * BYOK backend が compose モデルと credential と整合するか検証する。
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
  // Provider matching for BYOK runs is enforced at runtime via `resolveComposeModelId`.
  if (modelIds.length === 0) return;

  const expectedProvider = backendToCredentialProvider(input.backend);
  const key = await getUserAiCredentialPlaintext(input.userId, expectedProvider, input.db);
  if (!key?.trim()) {
    throw new HTTPException(400, {
      message: `No API credential configured for backend "${input.backend}"`,
    });
  }
}
