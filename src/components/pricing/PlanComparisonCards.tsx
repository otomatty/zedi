import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Sparkles, Zap } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@zedi/ui";
import type { BillingInterval } from "@/lib/subscriptionService";

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
  /** When false, the footer button is not rendered (used for the Free card). */
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
        <Badge variant="secondary" className="absolute top-3 right-3">
          {t("pricing.currentPlan")}
        </Badge>
      )}
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
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
          {priceNote && <span className="text-muted-foreground ml-2 text-sm">{priceNote}</span>}
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
      </CardContent>
      {showButton && (
        <CardFooter>
          <Button className="w-full" variant={buttonVariant} onClick={onSelect} disabled={disabled}>
            {buttonText}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

/**
 *
 */
export interface PlanComparisonCardsProps {
  /** Current billing interval used for the Pro card's price and CTA label. */
  billingInterval: BillingInterval;
  /** True when the current user has an active Pro subscription. */
  isProUser: boolean;
  /** True when the viewer is signed in (controls disabled state on the Pro CTA). */
  isSignedIn: boolean;
  /** Called when the Pro CTA is clicked for a non-Pro user (checkout). */
  onSelectPro: () => void;
  /** Optional className forwarded to the outer grid. */
  className?: string;
}

/**
 * Free / Pro plan comparison cards. The Pro card CTA is disabled when the
 * viewer is signed out, and is hidden entirely for existing Pro users (they
 * manage their plan in the subscription actions section instead).
 *
 * Free / Pro プラン比較カード。未ログイン時は Pro の CTA を非活性化し、既に
 * Pro のユーザーには CTA を表示しない（契約管理セクションで行うため）。
 */
export const PlanComparisonCards: React.FC<PlanComparisonCardsProps> = ({
  billingInterval,
  isProUser,
  isSignedIn,
  onSelectPro,
  className,
}) => {
  const { t } = useTranslation();
  return (
    <div className={cn("mx-auto grid max-w-4xl gap-6 md:grid-cols-2", className)}>
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
          billingInterval === "yearly"
            ? t("pricing.pro.subscribeYearly")
            : t("pricing.pro.subscribeMonthly")
        }
        onSelect={onSelectPro}
        current={isProUser}
        disabled={!isSignedIn}
        showButton={!isProUser}
      />
    </div>
  );
};

export default PlanComparisonCards;
