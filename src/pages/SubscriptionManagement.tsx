import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Zap,
  Calendar,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { Button } from "@zedi/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { Badge } from "@zedi/ui";
import { Progress } from "@zedi/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@zedi/ui";
import Container from "@/components/layout/Container";
import { cn } from "@zedi/ui";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@zedi/ui/components/sonner";
import {
  fetchSubscriptionDetails,
  cancelSubscription,
  reactivateSubscription,
  changeBillingInterval,
  openCustomerPortal,
  type SubscriptionDetails,
} from "@/lib/subscriptionService";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const SubscriptionManagement: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState<SubscriptionDetails | null>(null);
  const [fetchError, setFetchError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await fetchSubscriptionDetails();
      setDetails(data);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setFetchError(err);
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSignedIn) loadDetails();
    else setLoading(false);
  }, [isSignedIn, loadDetails]);

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await cancelSubscription();
      toast.success(t("pricing.subscription.actionSuccess"));
      await loadDetails();
    } catch {
      toast.error(t("pricing.subscription.actionFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await reactivateSubscription();
      toast.success(t("pricing.subscription.actionSuccess"));
      await loadDetails();
    } catch {
      toast.error(t("pricing.subscription.actionFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePlan = async (interval: "monthly" | "yearly") => {
    setActionLoading(true);
    try {
      await changeBillingInterval(interval);
      toast.success(t("pricing.subscription.actionSuccess"));
      await loadDetails();
    } catch {
      toast.error(t("pricing.subscription.actionFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const isProUser = details?.plan === "pro";
  const isCanceled = details?.status === "canceled";
  const percent = details ? Math.min(details.usage.usagePercent, 100) : 0;
  const isDanger = percent >= 95;
  const isWarning = percent >= 80;

  const statusLabel = (() => {
    if (!details) return "";
    switch (details.status) {
      case "canceled":
        return t("pricing.subscription.statusCanceled");
      case "past_due":
        return t("pricing.subscription.statusPastDue");
      case "trialing":
        return t("pricing.subscription.statusTrialing");
      default:
        return t("pricing.subscription.statusActive");
    }
  })();

  const statusVariant: "default" | "secondary" | "destructive" | "outline" = (() => {
    if (!details) return "secondary";
    switch (details.status) {
      case "canceled":
        return "destructive";
      case "past_due":
        return "destructive";
      case "trialing":
        return "outline";
      default:
        return "default";
    }
  })();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Link to="/pricing">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">{t("pricing.subscription.title")}</h1>
        </Container>
      </header>

      <main className="py-8">
        <Container className="max-w-2xl">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !isSignedIn ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">{t("pricing.signInPrompt")}</p>
              </CardContent>
            </Card>
          ) : fetchError ? (
            <Card>
              <CardContent className="space-y-4 py-12 text-center">
                <p className="text-muted-foreground">{t("pricing.subscription.actionFailed")}</p>
                <Button onClick={loadDetails} variant="outline">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("common.retry")}
                </Button>
              </CardContent>
            </Card>
          ) : !details ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !isProUser ? (
            <Card>
              <CardContent className="space-y-4 py-12 text-center">
                <p className="text-muted-foreground">{t("pricing.subscription.noSubscription")}</p>
                <Button onClick={() => navigate("/pricing")}>
                  <Zap className="mr-2 h-4 w-4" />
                  {t("pricing.subscription.upgradeToPro")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Plan & Status */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" />
                      <CardTitle>{t("pricing.status.proPlan")}</CardTitle>
                    </div>
                    <Badge variant={statusVariant}>{statusLabel}</Badge>
                  </div>
                  {isCanceled && details.currentPeriodEnd && (
                    <CardDescription>
                      {t("pricing.subscription.statusCanceledNote", {
                        date: formatDate(details.currentPeriodEnd),
                      })}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        {t("pricing.subscription.billingLabel")}
                      </span>
                      <p className="font-medium">
                        {details.billingInterval === "yearly"
                          ? t("pricing.subscription.yearly")
                          : details.billingInterval === "monthly"
                            ? t("pricing.subscription.monthly")
                            : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("pricing.subscription.nextBillingLabel")}
                      </span>
                      <p className="font-medium">{formatDate(details.currentPeriodEnd)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Usage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("pricing.status.aiUsage")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("pricing.status.costUnits")}</span>
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
                      {details.usage.consumedUnits.toLocaleString()} /{" "}
                      {details.usage.budgetUnits.toLocaleString()} {t("pricing.status.costUnits")}
                    </span>
                    <span>
                      {t("pricing.status.remaining")}:{" "}
                      {details.usage.remainingUnits.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <Card>
                <CardContent className="space-y-3 pt-6">
                  {/* Change billing interval */}
                  {!isCanceled && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          disabled={actionLoading}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {details.billingInterval === "yearly"
                            ? t("pricing.subscription.switchToMonthly")
                            : t("pricing.subscription.switchToYearly")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("pricing.subscription.changePlanConfirmTitle")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("pricing.subscription.changePlanConfirmDescription", {
                              interval:
                                details.billingInterval === "yearly"
                                  ? t("pricing.subscription.monthly")
                                  : t("pricing.subscription.yearly"),
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              handleChangePlan(
                                details.billingInterval === "yearly" ? "monthly" : "yearly",
                              )
                            }
                          >
                            {t("common.confirm")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  {/* Payment info (external) */}
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={async () => {
                      try {
                        await openCustomerPortal();
                      } catch {
                        toast.error(t("pricing.subscription.actionFailed"));
                      }
                    }}
                    disabled={actionLoading}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {t("pricing.subscription.paymentInfo")}
                    <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </Button>

                  {/* Cancel / Reactivate */}
                  {isCanceled ? (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleReactivate}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {t("pricing.subscription.reactivateSubscription")}
                    </Button>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-destructive hover:text-destructive"
                          disabled={actionLoading}
                        >
                          {t("pricing.subscription.cancelSubscription")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("pricing.subscription.cancelConfirmTitle")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("pricing.subscription.cancelConfirmDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleCancel}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t("pricing.subscription.cancelSubscription")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </Container>
      </main>
    </div>
  );
};

export default SubscriptionManagement;
