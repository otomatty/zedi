import React from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Zap } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { UsageMeter } from "./UsageMeter";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type StatusVariant = "default" | "secondary" | "destructive" | "outline";

function resolveStatusMeta(
  plan: "free" | "pro",
  status: string,
  t: (key: string) => string,
): { label: string; variant: StatusVariant } | null {
  if (plan !== "pro") return null;
  switch (status) {
    case "canceled":
      return { label: t("pricing.subscription.statusCanceled"), variant: "destructive" };
    case "past_due":
      return { label: t("pricing.subscription.statusPastDue"), variant: "destructive" };
    case "trialing":
      return { label: t("pricing.subscription.statusTrialing"), variant: "outline" };
    default:
      return { label: t("pricing.subscription.statusActive"), variant: "default" };
  }
}

/**
 *
 */
export interface PlanStatusCardProps {
  plan: "free" | "pro";
  status: string;
  billingInterval: "monthly" | "yearly" | null;
  currentPeriodEnd: string | null;
  usage: {
    consumedUnits: number;
    budgetUnits: number;
    remainingUnits: number;
    usagePercent: number;
  };
  /**
   * Shows the "access until end-date" note when the subscription is canceled.
   * 解約済みの場合に期限日付の案内文を表示するかどうか。
   */
  showCanceledNote?: boolean;
}

/**
 * Unified current-plan summary card shown at the top of `/pricing` when the
 * viewer is signed in. Renders plan name, status badge (Pro only), next
 * billing date, and an inline usage meter.
 *
 * ログイン済みユーザー向けに `/pricing` の先頭に表示する現行プランのサマリカード。
 * プラン名・ステータスバッジ（Pro のみ）・次回請求日・使用量メーターをまとめて表示する。
 */
export const PlanStatusCard: React.FC<PlanStatusCardProps> = ({
  plan,
  status,
  billingInterval,
  currentPeriodEnd,
  usage,
  showCanceledNote = true,
}) => {
  const { t } = useTranslation();
  const isPro = plan === "pro";
  const isCanceled = status === "canceled";
  const statusMeta = resolveStatusMeta(plan, status, t);

  const billingIntervalLabel =
    billingInterval === "yearly"
      ? t("pricing.subscription.yearly")
      : billingInterval === "monthly"
        ? t("pricing.subscription.monthly")
        : "—";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isPro ? (
              <Zap className="text-primary h-5 w-5" />
            ) : (
              <Sparkles className="text-muted-foreground h-5 w-5" />
            )}
            <CardTitle className="text-lg">
              {isPro ? t("pricing.status.proPlan") : t("pricing.status.freePlan")}
            </CardTitle>
          </div>
          {statusMeta && <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>}
        </div>
        {isPro && isCanceled && currentPeriodEnd && showCanceledNote && (
          <CardDescription>
            {t("pricing.subscription.statusCanceledNote", {
              date: formatDate(currentPeriodEnd),
            })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isPro && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">
                {t("pricing.subscription.billingLabel")}
              </span>
              <p className="font-medium">{billingIntervalLabel}</p>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("pricing.subscription.nextBillingLabel")}
              </span>
              <p className="font-medium">{formatDate(currentPeriodEnd)}</p>
            </div>
          </div>
        )}
        <UsageMeter
          consumedUnits={usage.consumedUnits}
          budgetUnits={usage.budgetUnits}
          remainingUnits={usage.remainingUnits}
          usagePercent={usage.usagePercent}
        />
      </CardContent>
    </Card>
  );
};

export default PlanStatusCard;
