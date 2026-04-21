import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, CreditCard, ExternalLink, Loader2, RefreshCw } from "lucide-react";
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
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zedi/ui";
import { toast } from "@zedi/ui/components/sonner";
import {
  cancelSubscription,
  changeBillingInterval,
  openCustomerPortal,
  reactivateSubscription,
} from "@/lib/subscriptionService";

/**
 * Props for {@link SubscriptionActions}.
 * {@link SubscriptionActions} の props。
 */
export interface SubscriptionActionsProps {
  /**
   * Current billing interval ("monthly" | "yearly" | null for pending states).
   * 現在の請求間隔。未確定の場合は null。
   */
  billingInterval: "monthly" | "yearly" | null;
  /**
   * True when the subscription is scheduled to cancel at period end.
   * 請求期間末で解約予約されている場合に true。
   */
  isCanceled: boolean;
  /**
   * Called after any mutation (cancel / reactivate / change-plan) succeeds so
   * the page can refresh subscription state (typically
   * `queryClient.invalidateQueries`). May return a Promise.
   *
   * 解約 / 再開 / 請求間隔変更が成功したあとに呼ばれる。ページ側で
   * `queryClient.invalidateQueries` を行いサブスク状態を再取得する。
   * Promise を返してもよい。
   */
  onMutated?: () => void | Promise<void>;
}

/**
 * Actions card shown to Pro users under the `/pricing#manage` section.
 * Handles switching billing interval, opening the Polar customer portal, and
 * canceling / reactivating the subscription — each action is wrapped in an
 * AlertDialog where confirmation is required.
 *
 * Pro ユーザー向けに `/pricing#manage` セクションに表示する契約アクション群。
 * 請求間隔切替・Polar カスタマーポータル起動・解約 / 再開を扱う。破壊的な
 * 操作には AlertDialog による確認ダイアログを挟む。
 */
export const SubscriptionActions: React.FC<SubscriptionActionsProps> = ({
  billingInterval,
  isCanceled,
  onMutated,
}) => {
  const { t } = useTranslation();
  const [actionLoading, setActionLoading] = useState(false);

  const runAction = async (action: () => Promise<unknown>, { refetch = true } = {}) => {
    setActionLoading(true);
    try {
      await action();
      toast.success(t("pricing.subscription.actionSuccess"));
      if (refetch) await onMutated?.();
    } catch {
      toast.error(t("pricing.subscription.actionFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = () => runAction(cancelSubscription);
  const handleReactivate = () => runAction(reactivateSubscription);
  const handleChangePlan = (interval: "monthly" | "yearly") =>
    runAction(() => changeBillingInterval(interval));
  // Opening the Polar portal doesn't change backend state immediately, but we
  // still want the loading / double-click guard and error toast that runAction
  // provides. Skip the onMutated refetch since nothing has changed yet.
  // Polar のポータルを開くだけでは即座にバックエンドの状態は変わらないが、
  // 二重クリック防止とエラートーストの統一のため runAction を使う。refetch は不要。
  const handleOpenPortal = () => runAction(openCustomerPortal, { refetch: false });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("pricing.subscription.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isCanceled && billingInterval && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start" disabled={actionLoading}>
                <Calendar className="mr-2 h-4 w-4" />
                {billingInterval === "yearly"
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
                      billingInterval === "yearly"
                        ? t("pricing.subscription.monthly")
                        : t("pricing.subscription.yearly"),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    handleChangePlan(billingInterval === "yearly" ? "monthly" : "yearly")
                  }
                >
                  {t("common.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleOpenPortal}
          disabled={actionLoading}
        >
          <CreditCard className="mr-2 h-4 w-4" />
          {t("pricing.subscription.paymentInfo")}
          <ExternalLink className="text-muted-foreground ml-auto h-3.5 w-3.5" />
        </Button>

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
                className="text-destructive hover:text-destructive w-full justify-start"
                disabled={actionLoading}
              >
                {t("pricing.subscription.cancelSubscription")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("pricing.subscription.cancelConfirmTitle")}</AlertDialogTitle>
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
  );
};

export default SubscriptionActions;
