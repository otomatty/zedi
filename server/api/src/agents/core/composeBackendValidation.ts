/**
 * Validate BYOK backend against compose graph model providers (#951).
 * Compose グラフのモデル provider と BYOK backend の整合を検証する。
 */
import { HTTPException } from "hono/http-exception";
import { validateModelAccess } from "../../services/usageService.js";
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

  const expectedProvider = backendToCredentialProvider(input.backend);
  const modelIds = getComposeModelIdsForGraph(input.graphId);

  for (const modelId of modelIds) {
    const modelInfo = await validateModelAccess(modelId, input.tier, input.db);
    if (modelInfo.provider !== expectedProvider) {
      throw new HTTPException(400, {
        message: `Backend "${input.backend}" does not match compose model "${modelId}" (provider ${modelInfo.provider})`,
      });
    }
  }

  const key = await getUserAiCredentialPlaintext(input.userId, expectedProvider, input.db);
  if (!key?.trim()) {
    throw new HTTPException(400, {
      message: `No API credential configured for backend "${input.backend}"`,
    });
  }
}
