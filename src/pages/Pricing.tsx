import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";
import { cn } from "@/lib/utils";
import { UsageBar } from "@/components/ai/UsageBar";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import {
  openProCheckout,
  openCustomerPortal,
  type BillingInterval,
} from "@/lib/subscriptionService";
import type { AIUsage } from "@/types/ai";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PlanCardProps {
  name: string;
  description: string;
  price: string;
  priceNote?: string;
  features: PlanFeature[];
  buttonText: string;
  buttonVariant?: "default" | "outline";
  popular?: boolean;
  icon: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  current?: boolean;
  extraContent?: React.ReactNode;
}

const PlanCard: React.FC<PlanCardProps> = ({
  name,
  description,
  price,
  priceNote,
  features,
  buttonText,
  buttonVariant = "default",
  popular,
  icon,
  onSelect,
  disabled,
  current,
  extraContent,
}) => {
  const { t } = useTranslation();
  return (
    <Card className={cn("relative flex flex-col", popular && "border-primary shadow-lg")}>
      {popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          {t("pricing.recommended")}
        </Badge>
      )}
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <CardTitle className="text-lg">{name}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="mb-6">
          <span className="text-3xl font-bold">{price}</span>
          {priceNote && <span className="ml-2 text-sm text-muted-foreground">{priceNote}</span>}
        </div>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  feature.included ? "text-primary" : "text-muted-foreground/30",
                )}
              />
              <span
                className={cn("text-sm", !feature.included && "text-muted-foreground line-through")}
              >
                {feature.text}
              </span>
            </li>
          ))}
        </ul>
        {extraContent && <div className="mt-4">{extraContent}</div>}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={buttonVariant}
          onClick={onSelect}
          disabled={disabled || current}
        >
          {current ? t("pricing.currentPlan") : buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
};

function PricingAiInfo() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <h3 className="mb-4 text-center text-lg font-semibold">{t("pricing.aiInfo.title")}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("pricing.aiInfo.freeTitle")}
          </h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>- {t("pricing.aiInfo.freeFeatures.models")}</li>
            <li>- {t("pricing.aiInfo.freeFeatures.limit")}</li>
            <li>- {t("pricing.aiInfo.freeFeatures.features")}</li>
          </ul>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <h4 className="mb-2 flex items-center gap-2 font-medium">
            <Zap className="h-4 w-4 text-primary" />
            {t("pricing.aiInfo.proTitle")}
          </h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>- {t("pricing.aiInfo.proFeatures.models")}</li>
            <li>- {t("pricing.aiInfo.proFeatures.limit")}</li>
            <li>- {t("pricing.aiInfo.proFeatures.features")}</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {t("pricing.aiInfo.ownApiKeyNote")}
      </p>
    </div>
  );
}

function PricingFaq() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <h3 className="mb-4 text-center text-lg font-semibold">{t("pricing.faq.title")}</h3>
      <div className="space-y-4">
        <div className="rounded-lg border p-4">
          <h4 className="mb-1 font-medium">{t("pricing.faq.usageCalculation.question")}</h4>
          <p className="text-sm text-muted-foreground">
            {t("pricing.faq.usageCalculation.answer")}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <h4 className="mb-1 font-medium">{t("pricing.faq.apiKeyDifference.question")}</h4>
          <p className="text-sm text-muted-foreground">
            {t("pricing.faq.apiKeyDifference.answer")}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <h4 className="mb-1 font-medium">{t("pricing.faq.refundPolicy.question")}</h4>
          <p className="text-sm text-muted-foreground">{t("pricing.faq.refundPolicy.answer")}</p>
        </div>
      </div>
    </div>
  );
}

function BillingIntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex justify-center gap-2">
      <Button
        variant={value === "monthly" ? "default" : "outline"}
        size="sm"
        onClick={() => onChange("monthly")}
      >
        {t("pricing.billingMonthly")}
      </Button>
      <Button
        variant={value === "yearly" ? "default" : "outline"}
        size="sm"
        onClick={() => onChange("yearly")}
      >
        {t("pricing.billingYearly")}
      </Button>
    </div>
  );
}

interface PricingPlanCardsProps {
  billingInterval: BillingInterval;
  isProUser: boolean;
  isSignedIn: boolean;
  usageForBar: AIUsage | null;
  onSelectPro: () => Promise<void>;
  onManageSubscription: () => Promise<void>;
}

function PricingPlanCards({
  billingInterval,
  isProUser,
  isSignedIn,
  usageForBar,
  onSelectPro,
  onManageSubscription,
}: PricingPlanCardsProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
      <PlanCard
        name={t("pricing.free.name")}
        description={t("pricing.free.description")}
        price={t("pricing.free.price")}
        icon={<Sparkles className="h-5 w-5" />}
        features={[
          { text: t("pricing.free.features.pages"), included: true },
          { text: t("pricing.free.features.cloudSync"), included: true },
          { text: t("pricing.free.features.wikiLinks"), included: true },
          { text: t("pricing.free.features.basicAI"), included: true },
          { text: t("pricing.free.features.unlimitedPages"), included: false },
          { text: t("pricing.free.features.advancedAI"), included: false },
        ]}
        buttonText={t("pricing.free.buttonText")}
        buttonVariant="outline"
        current={!isProUser}
        extraContent={
          isSignedIn && usageForBar && <UsageBar usage={usageForBar} autoRefresh={false} />
        }
      />
      <PlanCard
        name={t("pricing.pro.name")}
        description={t("pricing.pro.description")}
        price={billingInterval === "yearly" ? "$200" : "$20"}
        priceNote={
          billingInterval === "yearly"
            ? t("pricing.pro.priceYearly")
            : t("pricing.pro.priceMonthly")
        }
        icon={<Zap className="h-5 w-5" />}
        popular
        features={[
          { text: t("pricing.pro.features.unlimitedPages"), included: true },
          { text: t("pricing.pro.features.cloudSync"), included: true },
          { text: t("pricing.pro.features.wikiLinks"), included: true },
          { text: t("pricing.pro.features.allAIModels"), included: true },
          { text: t("pricing.pro.features.expandedUsage"), included: true },
          { text: t("pricing.pro.features.ownApiKey"), included: true },
        ]}
        buttonText={
          isProUser
            ? t("pricing.pro.manageSubscription")
            : billingInterval === "yearly"
              ? t("pricing.pro.subscribeYearly")
              : t("pricing.pro.subscribeMonthly")
        }
        onSelect={isProUser ? onManageSubscription : onSelectPro}
        current={false}
        disabled={!isSignedIn}
      />
    </div>
  );
}

const Pricing: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const { plan: currentPlan, isProUser, usage, isLoading, refetch } = useSubscription();

  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  const usageForBar: AIUsage | null = usage
    ? {
        usagePercent: usage.usagePercent,
        consumedUnits: usage.consumedUnits,
        budgetUnits: usage.budgetUnits,
        remaining: Math.max(0, usage.budgetUnits - usage.consumedUnits),
        tier: currentPlan === "pro" ? "pro" : "free",
        yearMonth: new Date().toISOString().slice(0, 7),
      }
    : null;

  const handleSelectPro = async () => {
    if (!isSignedIn) return;
    await openProCheckout(billingInterval);
    setTimeout(() => refetch(), 5000);
  };

  const handleManageSubscription = async () => {
    await openCustomerPortal();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Link to="/home">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">{t("pricing.pageTitle")}</h1>
        </Container>
      </header>

      <main className="py-8">
        <Container>
          <div className="mb-10 text-center">
            <h2 className="mb-2 text-2xl font-bold">{t("pricing.heading")}</h2>
            <p className="text-muted-foreground">{t("pricing.subheading")}</p>
          </div>

          <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} />

          <PricingPlanCards
            billingInterval={billingInterval}
            isProUser={isProUser}
            isSignedIn={isSignedIn}
            usageForBar={usageForBar}
            onSelectPro={handleSelectPro}
            onManageSubscription={handleManageSubscription}
          />

          {isLoading && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
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
