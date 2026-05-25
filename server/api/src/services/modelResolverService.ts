/**
 * AI モデル解決（システム既定・フォールバック）。
 * AI model resolution (system default and fallback chain).
 */
import { eq, asc } from "drizzle-orm";
import { aiModels, type AiModel } from "../schema/index.js";
import type { Database, UserTier } from "../types/index.js";

export type ResolvedModelAccess = {
  modelId: string;
  provider: string;
  apiModelId: string;
  inputCostUnits: number;
  outputCostUnits: number;
  /** True when a different model was chosen than requested. / 要求モデルと異なるモデルに解決した */
  didFallback: boolean;
};

/** Whether the user's tier can use this model row. / ユーザーティアでモデル行が利用可能か */
export function isModelTierAccessible(
  model: Pick<AiModel, "tierRequired">,
  tier: UserTier,
): boolean {
  return tier === "pro" || model.tierRequired === "free";
}

/** Whether an active model row is usable for the tier. / アクティブなモデル行がティアで使えるか */
export function isModelUsable(
  model: Pick<AiModel, "isActive" | "tierRequired">,
  tier: UserTier,
): boolean {
  return model.isActive && isModelTierAccessible(model, tier);
}

/**
 * Resolves the effective system default model id for a tier (configured default, then sort order).
 * ティア向けの実効システム既定モデル ID を解決する（設定既定 → sortOrder 順）。
 */
export async function resolveSystemDefaultModelId(
  tier: UserTier,
  db: Database,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(aiModels)
    .where(eq(aiModels.isActive, true))
    .orderBy(asc(aiModels.sortOrder), asc(aiModels.id));

  const configured = rows.find((m) => m.isSystemDefault && isModelTierAccessible(m, tier));
  if (configured) return configured.id;

  const firstAvailable = rows.find((m) => isModelTierAccessible(m, tier));
  return firstAvailable?.id ?? null;
}

/**
 * Resolves model access with fallback: requested → system default → sort order.
 * 要求モデル → システム既定 → sortOrder 順でモデルアクセスを解決する。
 */
export async function resolveModelAccessWithFallback(
  requestedModelId: string | null | undefined,
  tier: UserTier,
  db: Database,
): Promise<ResolvedModelAccess> {
  const rows = await db
    .select()
    .from(aiModels)
    .where(eq(aiModels.isActive, true))
    .orderBy(asc(aiModels.sortOrder), asc(aiModels.id));

  const usable = rows.filter((m) => isModelTierAccessible(m, tier));

  if (requestedModelId) {
    const requested = usable.find((m) => m.id === requestedModelId);
    if (requested) {
      return toResolvedAccess(requested, false);
    }
  }

  const configuredDefault = usable.find((m) => m.isSystemDefault);
  if (configuredDefault) {
    return toResolvedAccess(configuredDefault, Boolean(requestedModelId));
  }

  const first = usable[0];
  if (first) {
    return toResolvedAccess(first, Boolean(requestedModelId));
  }

  throw new Error("No available model for tier");
}

function toResolvedAccess(model: AiModel, didFallback: boolean): ResolvedModelAccess {
  return {
    modelId: model.id,
    provider: model.provider,
    apiModelId: model.modelId,
    inputCostUnits: model.inputCostUnits,
    outputCostUnits: model.outputCostUnits,
    didFallback,
  };
}

/**
 * Sets the system default model (clears other defaults in one transaction).
 * システム既定モデルを設定する（他行の既定フラグをトランザクションで解除）。
 */
export async function setSystemDefaultModel(modelId: string, db: Database): Promise<AiModel> {
  const result = await db.transaction(async (tx) => {
    const [target] = await tx.select().from(aiModels).where(eq(aiModels.id, modelId)).limit(1);
    if (!target) {
      throw new Error("NOT_FOUND");
    }
    if (!target.isActive) {
      throw new Error("INACTIVE");
    }

    await tx
      .update(aiModels)
      .set({ isSystemDefault: false })
      .where(eq(aiModels.isSystemDefault, true));
    const updated = await tx
      .update(aiModels)
      .set({ isSystemDefault: true })
      .where(eq(aiModels.id, modelId))
      .returning();
    return updated[0];
  });

  if (!result) {
    throw new Error("NOT_FOUND");
  }
  return result;
}

/**
 * Clears the system default flag from all models.
 * 全モデルのシステム既定フラグを解除する。
 */
export async function clearSystemDefaultModel(db: Database): Promise<void> {
  await db
    .update(aiModels)
    .set({ isSystemDefault: false })
    .where(eq(aiModels.isSystemDefault, true));
}
