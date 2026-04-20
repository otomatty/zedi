/**
 * Pricing page integration tests — verifies the conditional sections rendered
 * based on auth status and subscription plan after the /pricing + /subscription
 * merge (issue #671).
 *
 * /pricing ページの統合テスト。Issue #671 のプランページ統合後、認証状態と
 * プランに応じたセクション出し分けを検証する。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Pricing from "./Pricing";
import type { UseSubscriptionResult } from "@/hooks/useSubscription";

const { mockUseSubscription, mockUseAuth } = vi.hoisted(() => {
  return {
    mockUseSubscription: vi.fn(),
    mockUseAuth: vi.fn(),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options === "object") {
        return `${key}:${JSON.stringify(options)}`;
      }
      return key;
    },
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock("@/lib/subscriptionService", () => ({
  openProCheckout: vi.fn(),
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  changeBillingInterval: vi.fn(),
  openCustomerPortal: vi.fn(),
}));

vi.mock("@/components/layout/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
}));

vi.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ title, backTo }: { title: React.ReactNode; backTo?: string }) => (
    <header data-testid="page-header" data-back-to={backTo}>
      <h1>{title}</h1>
    </header>
  ),
}));

function buildSubscription(overrides: Partial<UseSubscriptionResult> = {}): UseSubscriptionResult {
  return {
    plan: "free",
    status: "active",
    billingInterval: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    externalId: null,
    isProUser: false,
    isCanceled: false,
    usage: {
      consumedUnits: 0,
      budgetUnits: 1500,
      remainingUnits: 1500,
      usagePercent: 0,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    invalidate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Pricing page — Signed-out viewer", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    mockUseSubscription.mockReturnValue(buildSubscription());
  });

  it("shows the sign-in prompt", () => {
    renderPricing();
    expect(screen.getByText("pricing.signInPrompt")).toBeInTheDocument();
  });

  it("shows the plan comparison cards and FAQ", () => {
    renderPricing();
    expect(screen.getByText("pricing.free.name")).toBeInTheDocument();
    expect(screen.getByText("pricing.pro.name")).toBeInTheDocument();
    expect(screen.getByText("pricing.faq.title")).toBeInTheDocument();
  });

  it("does not render the plan status card or subscription actions", () => {
    renderPricing();
    expect(screen.queryByText("pricing.heading")).not.toBeInTheDocument();
    expect(screen.queryByText("pricing.subscription.title")).not.toBeInTheDocument();
  });

  it("disables the Pro CTA button when signed out", () => {
    renderPricing();
    const proCta = screen.getByRole("button", { name: "pricing.pro.subscribeMonthly" });
    expect(proCta).toBeDisabled();
  });
});

describe("Pricing page — Signed-in Free user", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockUseSubscription.mockReturnValue(
      buildSubscription({
        plan: "free",
        status: "active",
        usage: {
          consumedUnits: 200,
          budgetUnits: 1500,
          remainingUnits: 1300,
          usagePercent: 13.3,
        },
      }),
    );
  });

  it("renders the current plan status with usage meter", () => {
    renderPricing();
    expect(screen.getByText("pricing.heading")).toBeInTheDocument();
    expect(screen.getByText("pricing.status.freePlan")).toBeInTheDocument();
    expect(screen.getAllByText("pricing.status.aiUsage").length).toBeGreaterThan(0);
  });

  it("does not show the subscription actions section", () => {
    renderPricing();
    expect(screen.queryByText("pricing.subscription.title")).not.toBeInTheDocument();
  });

  it("shows the Pro checkout CTA and billing interval toggle", () => {
    renderPricing();
    expect(screen.getByRole("button", { name: "pricing.billingMonthly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pricing.billingYearly" })).toBeInTheDocument();
    const proCta = screen.getByRole("button", { name: "pricing.pro.subscribeMonthly" });
    expect(proCta).toBeEnabled();
  });
});

describe("Pricing page — Signed-in Pro user (active)", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockUseSubscription.mockReturnValue(
      buildSubscription({
        plan: "pro",
        status: "active",
        billingInterval: "monthly",
        currentPeriodStart: "2026-04-01T00:00:00Z",
        currentPeriodEnd: "2026-05-01T00:00:00Z",
        externalId: "sub_active_1",
        isProUser: true,
        isCanceled: false,
        usage: {
          consumedUnits: 1200,
          budgetUnits: 10000,
          remainingUnits: 8800,
          usagePercent: 12,
        },
      }),
    );
  });

  it("renders the subscription management section anchored at #manage", () => {
    renderPricing();
    const section = document.getElementById("manage");
    expect(section).not.toBeNull();
    expect(screen.getAllByText("pricing.subscription.title").length).toBeGreaterThan(0);
  });

  it("shows the switch-to-yearly action (since current is monthly)", () => {
    renderPricing();
    expect(
      screen.getByRole("button", { name: /pricing.subscription.switchToYearly/ }),
    ).toBeInTheDocument();
  });

  it("shows the cancel subscription action (not the reactivate one)", () => {
    renderPricing();
    expect(
      screen.getAllByRole("button", { name: "pricing.subscription.cancelSubscription" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", {
        name: "pricing.subscription.reactivateSubscription",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not render the Pro checkout CTA or billing toggle", () => {
    renderPricing();
    expect(
      screen.queryByRole("button", { name: "pricing.pro.subscribeMonthly" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "pricing.billingMonthly" }),
    ).not.toBeInTheDocument();
  });
});

describe("Pricing page — Signed-in Pro user (canceled)", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    mockUseSubscription.mockReturnValue(
      buildSubscription({
        plan: "pro",
        status: "canceled",
        billingInterval: "monthly",
        currentPeriodStart: "2026-04-01T00:00:00Z",
        currentPeriodEnd: "2026-05-01T00:00:00Z",
        externalId: "sub_canceled_1",
        isProUser: false,
        isCanceled: true,
        usage: {
          consumedUnits: 1200,
          budgetUnits: 10000,
          remainingUnits: 8800,
          usagePercent: 12,
        },
      }),
    );
  });

  it("shows the canceled status note inside the plan status card", () => {
    renderPricing();
    const note = screen.getByText(/pricing\.subscription\.statusCanceledNote/);
    expect(note.textContent).toMatch(/date/);
  });

  it("shows the reactivate button and still renders plan comparison", () => {
    renderPricing();
    expect(
      screen.getByRole("button", { name: /pricing.subscription.reactivateSubscription/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("pricing.pro.name")).toBeInTheDocument();
  });
});
