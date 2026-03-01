import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, ExternalLink, Sparkles, Zap } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import Container from "@/components/layout/Container";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import {
  openProCheckout,
  openCustomerPortal,
  type BillingInterval,
} from "@/lib/subscriptionService";

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
  /** ボタンに表示するアイコン（例: 外部リンク） */
  buttonIcon?: React.ReactNode;
  /** false のときフッターのボタンを表示しない（Free プラン用） */
  showButton?: boolean;
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
  buttonIcon,
  showButton = true,
}) => {
  const { t } = useTranslation();
  return (
    <Card className={cn("relative flex flex-col", popular && "border-primary shadow-lg")}>
      {popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          {t("pricing.recommended")}
        </Badge>
      )}
      {current && (
        <Badge variant="secondary" className="absolute right-3 top-3">
          {t("pricing.currentPlan")}
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
      {showButton && (
        <CardFooter>
          <Button className="w-full" variant={buttonVariant} onClick={onSelect} disabled={disabled}>
            <span className="flex items-center justify-center gap-2">
              {buttonText}
              {buttonIcon ?? null}
            </span>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

interface CurrentPlanStatusProps {
  isSignedIn: boolean;
  isProUser: boolean;
  usage: { consumedUnits: number; budgetUnits: number; usagePercent: number } | null;
}

function CurrentPlanStatus({ isSignedIn, isProUser, usage }: CurrentPlanStatusProps) {
  const { t } = useTranslation();

  if (!isSignedIn) {
    return (
      <div className="mb-10 text-center">
        <p className="text-muted-foreground">{t("pricing.signInPrompt")}</p>
      </div>
    );
  }

  const percent = usage ? Math.min(usage.usagePercent, 100) : 0;
  const isWarning = percent >= 80;
  const isDanger = percent >= 95;
  const consumed = usage?.consumedUnits ?? 0;
  const budget = usage?.budgetUnits ?? 0;
  const yearMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="mx-auto mb-10">
      <h2 className="mb-2 text-xl font-bold">{t("pricing.heading")}</h2>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isProUser ? (
                <Zap className="h-5 w-5 text-primary" />
              ) : (
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-lg font-semibold">
                {isProUser ? t("pricing.status.proPlan") : t("pricing.status.freePlan")}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">{yearMonth}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("pricing.status.aiUsage")}</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  isDanger
                    ? "text-destructive"
                    : isWarning
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-foreground",
                )}
              >
                {percent.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={percent}
              className={cn(
                "h-2.5",
                isDanger && "[&>div]:bg-destructive",
                isWarning && !isDanger && "[&>div]:bg-yellow-500",
              )}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {consumed.toLocaleString()} / {budget.toLocaleString()}{" "}
                {t("pricing.status.costUnits")}
              </span>
              <span>
                {t("pricing.status.remaining")}: {Math.max(0, budget - consumed).toLocaleString()}
              </span>
            </div>
          </div>

          {isDanger && (
            <p className="text-xs text-destructive">{t("pricing.status.dangerWarning")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
  onSelectPro: () => Promise<void>;
  onManageSubscription: () => Promise<void>;
}

function PricingPlanCards({
  billingInterval,
  isProUser,
  isSignedIn,
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
        showButton={false}
      />
      <PlanCard
        name={t("pricing.pro.name")}
        description={t("pricing.pro.description")}
        price={
          billingInterval === "yearly"
            ? t("pricing.pro.priceYearlyDisplay")
            : t("pricing.pro.priceMonthlyDisplay")
        }
        priceNote={
          billingInterval === "yearly"
            ? t("pricing.pro.priceYearlyNote")
            : t("pricing.pro.priceMonthlyNote")
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
        buttonIcon={isProUser ? <ExternalLink className="h-4 w-4" /> : undefined}
        onSelect={isProUser ? onManageSubscription : onSelectPro}
        current={isProUser}
        disabled={!isSignedIn}
      />
    </div>
  );
}

const Pricing: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const { isProUser, usage, isLoading, refetch } = useSubscription();

  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");

  useEffect(() => {
    if (isSignedIn) refetch();
  }, [isSignedIn, refetch]);

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
          <CurrentPlanStatus isSignedIn={isSignedIn} isProUser={isProUser} usage={usage} />

          <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} />

          <PricingPlanCards
            billingInterval={billingInterval}
            isProUser={isProUser}
            isSignedIn={isSignedIn}
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
