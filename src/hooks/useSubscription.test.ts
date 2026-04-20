import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSubscription } from "./useSubscription";
import { createHookWrapper } from "@/test/testWrapper";
import type { SubscriptionState } from "@/lib/subscriptionService";

let mockIsSignedIn = false;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: mockIsSignedIn,
    userId: mockIsSignedIn ? "test-user-id" : null,
    getToken: vi.fn().mockResolvedValue(null),
    signOut: vi.fn(),
  }),
}));

const mockFetchSubscription = vi.fn();

vi.mock("@/lib/subscriptionService", () => ({
  fetchSubscription: (...args: unknown[]) => mockFetchSubscription(...args),
}));

describe("useSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSignedIn = false;
  });

  it("returns free plan when not signed in", () => {
    mockIsSignedIn = false;
    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    expect(result.current.plan).toBe("free");
    expect(result.current.isProUser).toBe(false);
  });

  it("returns pro plan when subscription is active", async () => {
    mockIsSignedIn = true;
    const proState: SubscriptionState = {
      plan: "pro",
      status: "active",
      billingInterval: "monthly",
      currentPeriodStart: "2026-02-23T00:00:00Z",
      currentPeriodEnd: "2026-03-23T00:00:00Z",
      externalId: "sub_123",
      usage: {
        consumedUnits: 100,
        budgetUnits: 50000,
        remainingUnits: 49900,
        usagePercent: 0.2,
      },
    };
    mockFetchSubscription.mockResolvedValue(proState);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(result.current.plan).toBe("pro");
    });

    expect(result.current.isProUser).toBe(true);
    expect(result.current.isCanceled).toBe(false);
    expect(result.current.billingInterval).toBe("monthly");
    expect(result.current.currentPeriodStart).toBe("2026-02-23T00:00:00Z");
    expect(result.current.externalId).toBe("sub_123");
    expect(result.current.usage.consumedUnits).toBe(100);
    expect(result.current.usage.remainingUnits).toBe(49900);
  });

  it("isProUser is true for pro/active subscription", async () => {
    mockIsSignedIn = true;
    mockFetchSubscription.mockResolvedValue({
      plan: "pro",
      status: "active",
      billingInterval: "yearly",
      currentPeriodStart: "2026-02-23T00:00:00Z",
      currentPeriodEnd: "2027-02-23T00:00:00Z",
      externalId: "sub_456",
      usage: { consumedUnits: 0, budgetUnits: 50000, remainingUnits: 50000, usagePercent: 0 },
    } satisfies SubscriptionState);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isProUser).toBe(true);
    });
  });

  it("isCanceled is true for pro/canceled subscription", async () => {
    mockIsSignedIn = true;
    mockFetchSubscription.mockResolvedValue({
      plan: "pro",
      status: "canceled",
      billingInterval: "monthly",
      currentPeriodStart: "2026-02-23T00:00:00Z",
      currentPeriodEnd: "2026-03-23T00:00:00Z",
      externalId: "sub_789",
      usage: { consumedUnits: 0, budgetUnits: 50000, remainingUnits: 50000, usagePercent: 0 },
    } satisfies SubscriptionState);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isCanceled).toBe(true);
    });
    expect(result.current.isProUser).toBe(false);
  });

  it("isProUser is false for free plan", async () => {
    mockIsSignedIn = true;
    mockFetchSubscription.mockResolvedValue({
      plan: "free",
      status: "active",
      billingInterval: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      externalId: null,
      usage: { consumedUnits: 0, budgetUnits: 1500, remainingUnits: 1500, usagePercent: 0 },
    } satisfies SubscriptionState);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(result.current.plan).toBe("free");
    });

    expect(result.current.isProUser).toBe(false);
  });

  it("isLoading is false when not signed in", () => {
    mockIsSignedIn = false;
    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("ignores cached Pro data when the user is signed out", async () => {
    mockIsSignedIn = true;
    mockFetchSubscription.mockResolvedValue({
      plan: "pro",
      status: "active",
      billingInterval: "monthly",
      currentPeriodStart: "2026-02-23T00:00:00Z",
      currentPeriodEnd: "2026-03-23T00:00:00Z",
      externalId: "sub_leak_test",
      usage: { consumedUnits: 10, budgetUnits: 50000, remainingUnits: 49990, usagePercent: 0.02 },
    } satisfies SubscriptionState);

    const wrapper = createHookWrapper();
    const { result, rerender } = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => {
      expect(result.current.isProUser).toBe(true);
    });

    mockIsSignedIn = false;
    rerender();

    expect(result.current.plan).toBe("free");
    expect(result.current.isProUser).toBe(false);
    expect(result.current.externalId).toBeNull();
  });

  it("invalidate() triggers a refetch with the latest fetcher result", async () => {
    mockIsSignedIn = true;
    mockFetchSubscription.mockResolvedValueOnce({
      plan: "pro",
      status: "active",
      billingInterval: "monthly",
      currentPeriodStart: "2026-02-23T00:00:00Z",
      currentPeriodEnd: "2026-03-23T00:00:00Z",
      externalId: "sub_inv_1",
      usage: { consumedUnits: 0, budgetUnits: 50000, remainingUnits: 50000, usagePercent: 0 },
    } satisfies SubscriptionState);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });

    mockFetchSubscription.mockResolvedValueOnce({
      plan: "pro",
      status: "canceled",
      billingInterval: "monthly",
      currentPeriodStart: "2026-02-23T00:00:00Z",
      currentPeriodEnd: "2026-03-23T00:00:00Z",
      externalId: "sub_inv_1",
      usage: { consumedUnits: 0, budgetUnits: 50000, remainingUnits: 50000, usagePercent: 0 },
    } satisfies SubscriptionState);

    await result.current.invalidate();

    await waitFor(() => {
      expect(result.current.isCanceled).toBe(true);
    });
    expect(mockFetchSubscription).toHaveBeenCalledTimes(2);
  });
});
