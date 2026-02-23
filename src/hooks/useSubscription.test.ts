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
      currentPeriodEnd: "2026-03-23T00:00:00Z",
      usage: { consumedUnits: 100, budgetUnits: 50000, usagePercent: 0.2 },
    };
    mockFetchSubscription.mockResolvedValue(proState);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(result.current.plan).toBe("pro");
    });

    expect(result.current.isProUser).toBe(true);
    expect(result.current.billingInterval).toBe("monthly");
    expect(result.current.usage.consumedUnits).toBe(100);
  });

  it("isProUser is true for pro/active subscription", async () => {
    mockIsSignedIn = true;
    mockFetchSubscription.mockResolvedValue({
      plan: "pro",
      status: "active",
      billingInterval: "yearly",
      currentPeriodEnd: "2027-02-23T00:00:00Z",
      usage: { consumedUnits: 0, budgetUnits: 50000, usagePercent: 0 },
    } satisfies SubscriptionState);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createHookWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isProUser).toBe(true);
    });
  });

  it("isProUser is false for free plan", async () => {
    mockIsSignedIn = true;
    mockFetchSubscription.mockResolvedValue({
      plan: "free",
      status: "active",
      billingInterval: null,
      currentPeriodEnd: null,
      usage: { consumedUnits: 0, budgetUnits: 1500, usagePercent: 0 },
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
});
