/**
 * オンボーディング状態のクライアント側キャッシュ。
 * Client-side cache for onboarding state.
 *
 * サーバー側の `user_onboarding_status` が真の情報源。ここではセットアップ
 * 完了フラグだけを localStorage にキャッシュして、アプリロード時の API 往復を
 * 避けるために使用する。フラグが立っていても、ログイン中はサーバー側の
 * GET /api/onboarding/status で裏付けをとる（`useOnboarding` 参照）。
 *
 * The server's `user_onboarding_status` table is the source of truth. This
 * module caches only the setup-completion flag in localStorage so the app can
 * decide routing synchronously on load; the flag is corroborated in the
 * background by GET /api/onboarding/status (see `useOnboarding`).
 */

const STORAGE_KEY = "zedi-onboarding-cache";

interface OnboardingCache {
  hasCompletedSetupWizard: boolean;
}

const DEFAULT_CACHE: OnboardingCache = {
  hasCompletedSetupWizard: false,
};

/**
 * localStorage から直近のキャッシュを取得する。失敗時はデフォルト値を返す。
 * Reads the local cache; returns defaults when storage is unavailable.
 */
export function getOnboardingCache(): OnboardingCache {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_CACHE;
    const parsed = JSON.parse(stored) as Partial<OnboardingCache>;
    return {
      hasCompletedSetupWizard: parsed.hasCompletedSetupWizard === true,
    };
  } catch (error) {
    console.warn("[onboardingState] Failed to read cache:", error);
    return DEFAULT_CACHE;
  }
}

/**
 * キャッシュを書き換える。部分更新対応。
 * Persists a partial update to the local cache.
 */
export function setOnboardingCache(patch: Partial<OnboardingCache>): void {
  try {
    const current = getOnboardingCache();
    const next = { ...current, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("[onboardingState] Failed to persist cache:", error);
  }
}

/**
 * セットアップウィザード完了フラグをキャッシュに立てる。
 * Marks the local setup-completion flag.
 */
export function markSetupWizardCompletedCache(): void {
  setOnboardingCache({ hasCompletedSetupWizard: true });
}

/**
 * ローカルキャッシュをクリアする。旧バージョンの localStorage キー
 * (`zedi-onboarding`) も同時に破棄して残骸が残らないようにする。
 *
 * Clears the local cache. Also drops the legacy `zedi-onboarding` key so
 * leftovers from the pre-server-backed flow do not linger.
 */
export function clearOnboardingCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("zedi-onboarding");
  } catch (error) {
    console.warn("[onboardingState] Failed to clear cache:", error);
  }
}
