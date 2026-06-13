import type { AIModel } from "@/types/ai";

/**
 * Options used to resolve the preferred server model.
 * 優先サーバーモデルの解決に使うオプション。
 */
export type ResolvePreferredServerModelOptions = {
  /** Current chat-store selection id / チャットストアの選択 ID */
  currentId?: string | null;
  /** Persisted settings model id / 設定に保存されたモデル ID */
  savedModelId?: string | null;
  /** Server-resolved default for the user's tier / サーバー解決済みの既定モデル ID */
  systemDefaultModelId?: string | null;
};

/**
 * Picks the best available server model: current → saved → system default → first.
 * 利用可能なサーバーモデルを優先度順に選ぶ（現在 → 保存 → システム既定 → 先頭）。
 */
export function resolvePreferredServerModel(
  available: AIModel[],
  options: ResolvePreferredServerModelOptions,
): AIModel | undefined {
  if (available.length === 0) return undefined;

  const { currentId, savedModelId, systemDefaultModelId } = options;

  if (currentId) {
    const matched = available.find((m) => m.id === currentId);
    if (matched) return matched;
  }

  if (savedModelId) {
    const matched = available.find((m) => m.id === savedModelId);
    if (matched) return matched;
  }

  if (systemDefaultModelId) {
    const matched = available.find((m) => m.id === systemDefaultModelId);
    if (matched) return matched;
  }

  return available[0];
}

/**
 * Returns a new selection when the current store id is absent from the available list.
 * ストアの選択が一覧に無いときだけ新しい選択を返す（それ以外は undefined）。
 */
export function resolveServerInitialSelection(
  available: AIModel[],
  current: { id: string } | null,
  savedModelId: string | undefined,
  systemDefaultModelId: string | null | undefined,
): AIModel | undefined {
  if (available.length === 0) return undefined;
  if (current && available.some((m) => m.id === current.id)) return undefined;
  return resolvePreferredServerModel(available, {
    savedModelId,
    systemDefaultModelId,
  });
}
