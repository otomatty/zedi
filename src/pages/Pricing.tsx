import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Container from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  BillingIntervalToggle,
  PlanComparisonCards,
  PlanStatusCard,
  PricingAiInfo,
  PricingFaq,
  SubscriptionActions,
} from "@/components/pricing";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { openProCheckout, type BillingInterval } from "@/lib/subscriptionService";

/**
 * Scroll to the deep-linked `#manage` anchor once the subscription state has
 * loaded so the element exists in the DOM. Runs only once per hash so the
 * page scroll isn't hijacked on subsequent state updates.
 *
 * サブスク状態のロード後に `#manage` アンカーへスクロールする。ハッシュ毎に
 * 1 回だけ実行するため、以降の状態更新でスクロールが奪われない。
 */
function useScrollToHashOnReady(ready: boolean) {
  const { hash } = useLocation();
  const lastScrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !hash) return;
    if (lastScrolled.current === hash) return;
    const el = document.getElementById(hash.replace(/^#/, ""));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      lastScrolled.current = hash;
    }
  }, [ready, hash]);
}

/**
 * Unified pricing page — combines the plan comparison (`/pricing`) and the
 * subscription management (`/subscription`) UIs into a single page whose
 * sections render conditionally based on auth and plan. See issue #671.
 *
 * 統合版プランページ。ログイン状態とプランに応じてセクションを出し分け、
 * `/pricing` と旧 `/subscription` の UI を 1 ページにまとめる。Issue #671 を参照。
 */
const Pricing: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const {
    plan,
    status,
    billingInterval,
    currentPeriodEnd,
    isProUser,
    isCanceled,
    usage,
    isLoading,
    invalidate,
  } = useSubscription();

  const [selectedBillingInterval, setSelectedBillingInterval] =
    useState<BillingInterval>("monthly");

  useScrollToHashOnReady(!isLoading);

  const handleSelectPro = async () => {
    if (!isSignedIn) return;
    await openProCheckout(selectedBillingInterval);
    // 5s delay keeps the UI responsive while the Polar webhook reconciles.
    // 5 秒待つことで Polar の webhook 完了後に最新状態を反映しやすくする。
    setTimeout(() => {
      void invalidate();
    }, 5000);
  };

  const showPlanStatusCard = isSignedIn;
  const showSubscriptionActions = isSignedIn && (isProUser || isCanceled);
  const showBillingToggle = !isProUser;
  const showPlanComparisonCards = !isProUser || isCanceled;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("pricing.pageTitle")} backTo="/home" backLabel={t("common.back")} />

      <main className="min-h-0 flex-1 overflow-y-auto py-8">
        <Container>
          {showPlanStatusCard && (
            <section className="mx-auto mb-10">
              <h2 className="mb-2 text-xl font-bold">{t("pricing.heading")}</h2>
              <PlanStatusCard
                plan={plan}
                status={status}
                billingInterval={billingInterval}
                currentPeriodEnd={currentPeriodEnd}
                usage={usage}
              />
            </section>
          )}

          {!isSignedIn && (
            <section className="mb-10 text-center">
              <p className="text-muted-foreground">{t("pricing.signInPrompt")}</p>
            </section>
          )}

          {showSubscriptionActions && (
            <section id="manage" className="mx-auto mb-10 scroll-mt-24">
              <h2 className="mb-2 text-xl font-bold">{t("pricing.subscription.title")}</h2>
              <SubscriptionActions
                billingInterval={billingInterval}
                isCanceled={isCanceled}
                onMutated={invalidate}
              />
            </section>
          )}

          {showBillingToggle && (
            <BillingIntervalToggle
              className="mb-6"
              value={selectedBillingInterval}
              onChange={setSelectedBillingInterval}
            />
          )}

          {showPlanComparisonCards && (
            <PlanComparisonCards
              billingInterval={selectedBillingInterval}
              isProUser={isProUser}
              isSignedIn={isSignedIn}
              onSelectPro={handleSelectPro}
            />
          )}

          {isLoading && (
            <p className="text-muted-foreground mt-4 text-center text-sm">
              {t("pricing.loadingPlan")}
            </p>
          )}

          <PricingAiInfo />
          <PricingFaq />
        </Container>
      </main>
    </div>
  );
};

export default Pricing;
