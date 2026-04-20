/**
 * Subscription hook — fetches current plan and usage from GET /api/ai/subscription
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchSubscription, type SubscriptionState } from "@/lib/subscriptionService";

/**
 * React Query cache key for the subscription state query.
 * Exported so callers that need to invalidate this cache (e.g. after
 * cancel/reactivate/change-plan actions) can reuse the same tuple.
 *
 * サブスクリプション状態クエリのキャッシュキー。解約・再開・請求間隔変更後に
 * 同じタプルで invalidate できるよう export している。
 */
export const subscriptionQueryKey = ["subscription"] as const;

/**
 *
 */
export interface UseSubscriptionResult {
  /** Current plan: free | pro */
  plan: SubscriptionState["plan"];
  /** Subscription status from backend */
  status: string;
  /** monthly | yearly | null */
  billingInterval: SubscriptionState["billingInterval"];
  /** Current period start ISO string or null */
  currentPeriodStart: string | null;
  /** Current period end ISO string or null */
  currentPeriodEnd: string | null;
  /** Polar subscription id (external). null if no active Polar subscription. */
  externalId: string | null;
  /** True when user has an active Pro subscription */
  isProUser: boolean;
  /** True when the Pro subscription is set to cancel at period end. */
  isCanceled: boolean;
  /** Usage from the subscription API */
  usage: SubscriptionState["usage"];
  /** Loading state */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch subscription state (e.g. after returning from checkout) */
  refetch: () => void;
  /**
   * Invalidate the subscription query cache. Call this after mutations that
   * change the backend state (cancel / reactivate / change-plan) to guarantee
   * the next read is fresh rather than waiting for the 60s staleTime.
   *
   * クエリキャッシュを無効化する。解約 / 再開 / 請求間隔変更などの後で呼ぶと、
   * 60 秒の staleTime を待たずに最新の状態を再取得できる。
   */
  invalidate: () => Promise<void>;
}

const FREE_FALLBACK: SubscriptionState = {
  plan: "free",
  status: "active",
  billingInterval: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  externalId: null,
  usage: { consumedUnits: 0, budgetUnits: 1500, remainingUnits: 1500, usagePercent: 0 },
};

/**
 *
 */
export function useSubscription(): UseSubscriptionResult {
  /**
   *
   */
  const { isSignedIn } = useAuth();
  /**
   *
   */
  const queryClient = useQueryClient();
  /**
   *
   */
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: subscriptionQueryKey,
    queryFn: fetchSubscription,
    enabled: isSignedIn === true,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true, // ポータル/チェックアウトから戻ったときに表示を更新
  });

  /**
   *
   */
  const state = data ?? FREE_FALLBACK;
  /**
   *
   */
  const isProUser =
    state.plan === "pro" && (state.status === "active" || state.status === "trialing");
  /**
   *
   */
  const isCanceled = state.plan === "pro" && state.status === "canceled";

  /**
   *
   */
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: subscriptionQueryKey }),
    [queryClient],
  );

  return {
    plan: state.plan,
    status: state.status,
    billingInterval: state.billingInterval,
    currentPeriodStart: state.currentPeriodStart,
    currentPeriodEnd: state.currentPeriodEnd,
    externalId: state.externalId,
    isProUser,
    isCanceled,
    usage: state.usage,
    isLoading: isSignedIn ? isLoading : false,
    error: error instanceof Error ? error : null,
    refetch,
    invalidate,
  };
}
