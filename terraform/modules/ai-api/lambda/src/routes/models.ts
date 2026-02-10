/**
 * Models route handler — returns available AI models filtered by user tier
 */

import type { EnvConfig } from "../types/index.js";
import { getActiveModels } from "../services/usageService.js";
import { getSubscription } from "../services/subscriptionService.js";

interface ModelResponse {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  tierRequired: string;
  available: boolean;
}

export async function handleGetModels(
  userId: string | undefined,
  env: EnvConfig
): Promise<{ models: ModelResponse[]; tier: string }> {
  const models = await getActiveModels(env);

  let userTier = "free";
  if (userId) {
    const subscription = await getSubscription(userId, env);
    userTier = subscription?.plan ?? "free";
  }

  const modelResponses: ModelResponse[] = models.map((m) => ({
    id: m.id,
    provider: m.provider,
    modelId: m.model_id,
    displayName: m.display_name,
    tierRequired: m.tier_required,
    available: m.tier_required === "free" || userTier === "paid",
  }));

  return { models: modelResponses, tier: userTier };
}
