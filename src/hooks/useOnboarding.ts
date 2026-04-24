import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";
import {
  clearOnboardingCache,
  getOnboardingCache,
  markSetupWizardCompletedCache,
  setOnboardingCache,
} from "@/lib/onboardingState";

/**
 * オンボーディング状況を表すクライアント側の表現。サーバー応答のうち
 * ルーティングとウェルカムページ遷移に必要な値のみを保持する。
 *
 * Client-side view of the onboarding state, storing just the values needed
 * for routing and welcome-page navigation.
 */
export interface OnboardingStatus {
  hasCompletedSetupWizard: boolean;
  welcomePageId: string | null;
}

/**
 * Hook to manage onboarding state and actions.
 *
 * サーバー側 `user_onboarding_status` を真の情報源とし、localStorage の
 * キャッシュを即時表示用に利用する。キャッシュはユーザー ID で名前空間化して
 * 共用端末で別アカウントのフラグを継承しないようにする。アプリロード時には
 * status API で裏付けを取り、不整合があればキャッシュを修正する。ウェルカム
 * ページ生成のリトライはサーバー側 GET /api/onboarding/status 内で行われる。
 *
 * Server-side `user_onboarding_status` is authoritative; the local cache —
 * namespaced by user id to avoid leaking `hasCompletedSetupWizard` between
 * accounts on shared browsers — is used for synchronous routing. A background
 * fetch reconciles it on app load. Welcome page creation retry happens
 * server-side inside GET /api/onboarding/status.
 */
export function useOnboarding() {
  const { isSignedIn, userId } = useAuth();
  const apiClient = useMemo(() => createApiClient(), []);
  // getOnboardingCache が旧キーからのマイグレーションも担当するので
  // ここでは何もせずそのまま初期値として使う。
  // getOnboardingCache handles migration from legacy keys internally, so we
  // simply use its return value as the initial state.
  const [cache, setCache] = useState(() => getOnboardingCache(userId));
  const [welcomePageId, setWelcomePageId] = useState<string | null>(null);
  // React 公式推奨の「前の prop を state に保存して比較する」パターンで、
  // userId が切り替わったら cache / welcomePageId をリセットする（useEffect
  // 内の setState は cascading render を招くので避ける）。
  // Canonical React pattern for resetting state when a prop changes: track the
  // previous identifier in state and re-sync during render. Avoids the
  // setState-inside-useEffect anti-pattern.
  const [trackedUserId, setTrackedUserId] = useState<string | null | undefined>(userId);
  if (trackedUserId !== userId) {
    setTrackedUserId(userId);
    setCache(getOnboardingCache(userId));
    setWelcomePageId(null);
  }

  const needsSetupWizard = isSignedIn && !cache.hasCompletedSetupWizard;

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await apiClient.getOnboardingStatus();
        if (cancelled) return;
        const completed = status.setup_completed_at !== null;
        // 現在のキャッシュは直接読んで比較する（依存には含めない）。含めてしまうと
        // 自分が setCache した値で effect が再実行されて二重リクエストになる。
        // Read the current cache directly instead of closing over it — including
        // `cache.hasCompletedSetupWizard` in the dependency list would rerun this
        // effect after our own setCache and trigger a wasted second fetch.
        const cached = getOnboardingCache(userId).hasCompletedSetupWizard;
        if (completed !== cached) {
          setOnboardingCache(userId, { hasCompletedSetupWizard: completed });
          setCache({ hasCompletedSetupWizard: completed });
        }
        setWelcomePageId(status.welcome_page_id);
      } catch (error) {
        // ネットワーク失敗時はキャッシュ値を維持する。サインイン済みユーザーに
        // 対し誤ってウィザードを何度も見せないため、API エラーは握りつぶす。
        // On network failure, keep the cache; errors are logged only so we
        // don't incorrectly re-trigger the wizard for returning users.
        console.warn("[useOnboarding] failed to fetch status:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiClient, isSignedIn, userId]);

  /**
   * ウィザード完了をサーバーと localStorage の両方に記録する。
   * プロフィール・ロケール・ウェルカムページ生成を 1 回の API 呼び出しで処理する。
   *
   * Records wizard completion both on the server (profile + setup flag +
   * welcome page generation in a single API call) and in the local cache.
   */
  const completeSetupWizard = useCallback(
    async (input: { displayName: string; avatarUrl?: string | null; locale: "ja" | "en" }) => {
      const response = await apiClient.completeOnboarding({
        display_name: input.displayName,
        avatar_url: input.avatarUrl ?? null,
        locale: input.locale,
      });
      markSetupWizardCompletedCache(userId);
      setCache({ hasCompletedSetupWizard: true });
      setWelcomePageId(response.welcome_page_id);
      return response;
    },
    [apiClient, userId],
  );

  /**
   * サインアウト時にローカルキャッシュを破棄するためのヘルパー。
   * Helper to drop the local cache (e.g. on sign out).
   */
  const resetLocalCache = useCallback(() => {
    clearOnboardingCache(userId);
    setCache({ hasCompletedSetupWizard: false });
    setWelcomePageId(null);
  }, [userId]);

  const status: OnboardingStatus = {
    hasCompletedSetupWizard: cache.hasCompletedSetupWizard,
    welcomePageId,
  };

  return {
    status,
    needsSetupWizard,
    completeSetupWizard,
    resetLocalCache,
  };
}
