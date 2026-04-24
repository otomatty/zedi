import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";
import {
  getOnboardingCache,
  markSetupWizardCompletedCache,
  setOnboardingCache,
  clearOnboardingCache,
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
 * キャッシュを即時表示用に利用する。アプリロード時に status API で裏付けを
 * 取り、不整合があればキャッシュを修正する。ウェルカムページ生成のリトライ
 * はサーバー側 GET /api/onboarding/status 内で行われる。
 *
 * Server-side `user_onboarding_status` is authoritative; the local cache is
 * used for synchronous routing. A background fetch reconciles the cache on
 * app load. Welcome page creation retry happens server-side as part of
 * GET /api/onboarding/status.
 */
export function useOnboarding() {
  const { isSignedIn } = useAuth();
  const apiClient = useMemo(() => createApiClient(), []);
  const [cache, setCache] = useState(getOnboardingCache);
  const [welcomePageId, setWelcomePageId] = useState<string | null>(null);

  const needsSetupWizard = isSignedIn && !cache.hasCompletedSetupWizard;

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await apiClient.getOnboardingStatus();
        if (cancelled) return;
        const completed = status.setup_completed_at !== null;
        if (completed !== cache.hasCompletedSetupWizard) {
          setOnboardingCache({ hasCompletedSetupWizard: completed });
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
  }, [apiClient, cache.hasCompletedSetupWizard, isSignedIn]);

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
      markSetupWizardCompletedCache();
      setCache({ hasCompletedSetupWizard: true });
      setWelcomePageId(response.welcome_page_id);
      return response;
    },
    [apiClient],
  );

  /**
   * サインアウト時にローカルキャッシュを破棄するためのヘルパー。
   * Helper to drop the local cache (e.g. on sign out).
   */
  const resetLocalCache = useCallback(() => {
    clearOnboardingCache();
    setCache({ hasCompletedSetupWizard: false });
    setWelcomePageId(null);
  }, []);

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
