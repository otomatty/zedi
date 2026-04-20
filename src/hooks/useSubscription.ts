/**
 * Subscription hook — fetches current plan and usage from GET /api/ai/subscription.
 * `/api/ai/subscription` からプランと使用量を取得するカスタムフック。
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchSubscription, type SubscriptionState } from "@/lib/subscriptionService";

/**
 * React Query cache key for the subscription state query.
 * Exported so callers that need to invalidate this cache (e.g. after
 * cancel / reactivate / change-plan actions) can reuse the same tuple.
 *
 * サブスクリプション状態クエリのキャッシュキー。解約・再開・請求間隔変更後に
 * 同じタプルで invalidate できるよう export している。
 */
export const subscriptionQueryKey = ["subscription"] as const;

/**
 * Result shape returned by {@link useSubscription}. Combines the raw
 * subscription state with derived flags the UI consumes directly.
 *
 * {@link useSubscription} の戻り値。取得したサブスクリプション状態と、UI が
 * そのまま使える派生フラグをまとめて提供する。
 */
export interface UseSubscriptionResult {
  /** Current plan on the subscription contract ("pro" even while canceled). */
  plan: SubscriptionState["plan"];
  /** Subscription status from backend ("active" | "canceled" | "past_due" | "trialing" | ...). */
  status: string;
  /** Current billing cadence, or null when no subscription exists. */
  billingInterval: SubscriptionState["billingInterval"];
  /**
   * Current period start as an ISO date-time string, or null.
   * 現在の請求期間の開始日時（ISO 文字列）、なければ null。
   */
  currentPeriodStart: string | null;
  /**
   * Current period end as an ISO date-time string, or null.
   * 現在の請求期間の終了日時（ISO 文字列）、なければ null。
   */
  currentPeriodEnd: string | null;
  /**
   * Polar subscription id used for customer portal and cancellation flows,
   * or null when no Polar subscription exists.
   * Polar サブスクリプションの ID（ポータル／解約で使用）。なければ null。
   */
  externalId: string | null;
  /** True when the viewer currently has a live Pro entitlement. */
  isProUser: boolean;
  /** True when the Pro subscription is scheduled to cancel at period end. */
  isCanceled: boolean;
  /** Usage from the subscription API. */
  usage: SubscriptionState["usage"];
  /** Initial-fetch loading state (false when signed out). */
  isLoading: boolean;
  /** Error if the last fetch failed. */
  error: Error | null;
  /** Refetch subscription state (e.g. after returning from checkout). */
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
 * Read the current user's subscription plan, status, and usage.
 * ログイン中ユーザーのプラン・ステータス・使用量を取得する。
 *
 * When the viewer is signed out the hook returns the Free fallback state even
 * if a previous signed-in session left Pro data in the React Query cache.
 * This prevents the UI from leaking another user's plan after sign-out.
 *
 * サインアウト時は、前回のサインイン済みセッションが React Query キャッシュに
 * 残した Pro データに関係なく Free のフォールバックを返す。サインアウト後に
 * 前のユーザーのプランが UI に漏れないようにするため。
 */
export function useSubscription(): UseSubscriptionResult {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: subscriptionQueryKey,
    queryFn: fetchSubscription,
    enabled: isSignedIn === true,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true, // ポータル/チェックアウトから戻ったときに表示を更新
  });

  const state = isSignedIn ? (data ?? FREE_FALLBACK) : FREE_FALLBACK;
  const isProUser =
    state.plan === "pro" && (state.status === "active" || state.status === "trialing");
  const isCanceled = state.plan === "pro" && state.status === "canceled";

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
