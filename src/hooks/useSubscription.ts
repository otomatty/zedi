/**
 * Subscription hook — fetches current plan and usage from GET /api/ai/subscription
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchSubscription,
  type SubscriptionState,
} from "@/lib/subscriptionService";

const subscriptionQueryKey = ["subscription"] as const;

export interface UseSubscriptionResult {
  /** Current plan: free | pro */
  plan: SubscriptionState["plan"];
  /** Subscription status from backend */
  status: string;
  /** monthly | yearly | null */
  billingInterval: SubscriptionState["billingInterval"];
  /** Current period end ISO string or null */
  currentPeriodEnd: string | null;
  /** True when user has an active Pro subscription */
  isProUser: boolean;
  /** Usage from the subscription API */
  usage: SubscriptionState["usage"];
  /** Loading state */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch subscription state (e.g. after returning from checkout) */
  refetch: () => void;
}

export function useSubscription(): UseSubscriptionResult {
  const { isSignedIn } = useAuth();
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: subscriptionQueryKey,
    queryFn: fetchSubscription,
    enabled: isSignedIn === true,
    staleTime: 60 * 1000, // 1 minute
  });

  const fallback: SubscriptionState = {
    plan: "free",
    status: "active",
    billingInterval: null,
    currentPeriodEnd: null,
    usage: { consumedUnits: 0, budgetUnits: 1500, usagePercent: 0 },
  };

  const state = data ?? fallback;
  const isProUser = state.plan === "pro" && (state.status === "active" || state.status === "trialing");

  return {
    plan: state.plan,
    status: state.status,
    billingInterval: state.billingInterval,
    currentPeriodEnd: state.currentPeriodEnd,
    isProUser,
    usage: state.usage,
    isLoading: isSignedIn ? isLoading : false,
    error: error instanceof Error ? error : null,
    refetch,
  };
}
