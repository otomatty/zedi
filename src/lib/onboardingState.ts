/**
 * オンボーディング状態のクライアント側キャッシュ。
 * Client-side cache for onboarding state.
 *
 * サーバー側の `user_onboarding_status` が真の情報源。ここではセットアップ
 * 完了フラグだけを localStorage にキャッシュして、アプリロード時の API 往復を
 * 避けるために使用する。キーはユーザー ID で名前空間化する（共用端末で別
 * ユーザーの `hasCompletedSetupWizard` が漏れないようにするため）。フラグが
 * 立っていても、ログイン中はサーバー側の GET /api/onboarding/status で裏付けを
 * とる（`useOnboarding` 参照）。
 *
 * The server's `user_onboarding_status` table is the source of truth. This
 * module caches only the setup-completion flag in localStorage so the app can
 * decide routing synchronously on load. The key is namespaced by user ID so a
 * shared browser never inherits another account's flag. The value is still
 * corroborated in the background via GET /api/onboarding/status (see
 * `useOnboarding`).
 */

const STORAGE_PREFIX = "zedi-onboarding-cache";
/** 旧実装（未ログイン時を含むグローバルキー）。移行時に掃除する。 */
/** Legacy global-key storage used before per-user namespacing. */
const LEGACY_GLOBAL_KEY = "zedi-onboarding-cache";
/** さらに古い key。残っていたら掃除する。 */
/** Older legacy key; clean it up too. */
const PRE_V2_LEGACY_KEY = "zedi-onboarding";

interface OnboardingCache {
  hasCompletedSetupWizard: boolean;
}

const DEFAULT_CACHE: OnboardingCache = {
  hasCompletedSetupWizard: false,
};

/**
 * 指定ユーザー用の localStorage キーを組み立てる。`userId` が無い（未ログイン）
 * 場合はキャッシュを使わず、常にデフォルト値として扱う。
 *
 * Builds the per-user localStorage key. When `userId` is missing (signed-out
 * visitor), no cache key is used and the default is returned.
 */
function keyFor(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `${STORAGE_PREFIX}:${userId}`;
}

/**
 * 旧実装のキーからセットアップ完了済みフラグを読み出す。旧・旧々両方を見る。
 * ログイン済みの既存ユーザーが新キー名変更でオンボーディングを
 * やり直させられないための互換経路。
 *
 * Reads the completion flag from legacy keys (`zedi-onboarding-cache` global
 * and the even-older `zedi-onboarding`). Keeps existing signed-in users from
 * being redirected back through the wizard after the storage-key rename.
 */
function readLegacyCompletion(): boolean {
  for (const legacyKey of [LEGACY_GLOBAL_KEY, PRE_V2_LEGACY_KEY]) {
    try {
      const stored = localStorage.getItem(legacyKey);
      if (!stored) continue;
      const parsed = JSON.parse(stored) as { hasCompletedSetupWizard?: unknown };
      if (parsed?.hasCompletedSetupWizard === true) return true;
    } catch {
      // ignore malformed legacy entries
    }
  }
  return false;
}

/**
 * 指定ユーザーのキャッシュを取得する。新キーに無くても、旧キー
 * (`zedi-onboarding`) に `hasCompletedSetupWizard: true` が残っていれば
 * マイグレートしてそれを返す。
 *
 * Reads the cache for the given user. Falls back to the legacy
 * `zedi-onboarding` key when the new per-user entry is missing, migrating
 * the value onto the new key so subsequent reads are fast.
 */
export function getOnboardingCache(userId: string | null | undefined): OnboardingCache {
  const key = keyFor(userId);
  if (!key) return DEFAULT_CACHE;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<OnboardingCache>;
      return {
        hasCompletedSetupWizard: parsed.hasCompletedSetupWizard === true,
      };
    }
  } catch (error) {
    console.warn("[onboardingState] Failed to read cache:", error);
    return DEFAULT_CACHE;
  }
  // 新キーに値が無いので旧キーを覗く（互換レイヤー）。マイグレーション完了後に
  // 旧キーを掃除し、次回以降はファストパスで完結させる。
  // Fall back to the legacy keys (compat layer). After promoting the flag to
  // the per-user key, drop the legacy entries so the fast path wins next time.
  if (readLegacyCompletion()) {
    setOnboardingCache(userId, { hasCompletedSetupWizard: true });
    try {
      localStorage.removeItem(LEGACY_GLOBAL_KEY);
      localStorage.removeItem(PRE_V2_LEGACY_KEY);
    } catch {
      // Non-critical: legacy entries will be cleaned up on a later run.
    }
    return { hasCompletedSetupWizard: true };
  }
  return DEFAULT_CACHE;
}

/**
 * 指定ユーザーのキャッシュに部分更新を書き込む。未ログイン時は何もしない。
 * Persists a partial update to the given user's cache. No-op when signed out.
 */
export function setOnboardingCache(
  userId: string | null | undefined,
  patch: Partial<OnboardingCache>,
): void {
  const key = keyFor(userId);
  if (!key) return;
  try {
    const current = getOnboardingCache(userId);
    const next = { ...current, ...patch };
    localStorage.setItem(key, JSON.stringify(next));
  } catch (error) {
    console.warn("[onboardingState] Failed to persist cache:", error);
  }
}

/**
 * セットアップウィザード完了フラグを指定ユーザーに対して立てる。
 * Marks the local setup-completion flag for the given user.
 */
export function markSetupWizardCompletedCache(userId: string | null | undefined): void {
  setOnboardingCache(userId, { hasCompletedSetupWizard: true });
}

/**
 * 指定ユーザーのキャッシュをクリアする。旧キー（名前空間化前のグローバルキー、
 * およびさらに前のバージョン）も併せて掃除する。
 *
 * Clears the current user's cache. Also cleans up legacy keys (the pre-v2
 * per-namespace key and the even older `zedi-onboarding`).
 */
export function clearOnboardingCache(userId: string | null | undefined): void {
  try {
    const key = keyFor(userId);
    if (key) localStorage.removeItem(key);
    localStorage.removeItem(LEGACY_GLOBAL_KEY);
    localStorage.removeItem(PRE_V2_LEGACY_KEY);
  } catch (error) {
    console.warn("[onboardingState] Failed to clear cache:", error);
  }
}

/**
 * 旧実装が使っていたグローバルキーだけを掃除する（ユーザー特定不要）。サインイン
 * 前や startup で呼ぶことで、残留値が新しい per-user キャッシュに影響しないようにする。
 *
 * Removes only the legacy global keys without touching any per-user entry.
 * Safe to call at startup or before a user is identified.
 */
export function clearLegacyOnboardingCaches(): void {
  try {
    localStorage.removeItem(LEGACY_GLOBAL_KEY);
    localStorage.removeItem(PRE_V2_LEGACY_KEY);
  } catch (error) {
    console.warn("[onboardingState] Failed to clear legacy caches:", error);
  }
}
