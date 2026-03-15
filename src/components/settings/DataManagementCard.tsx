import React, { useCallback, useState } from "react";
import { Loader2, DatabaseZap } from "lucide-react";
import { Button } from "@zedi/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
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
import { toast } from "@zedi/ui/components/sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { pageKeys } from "@/hooks/usePageQueries";
import { createStorageAdapter } from "@/lib/storageAdapter";
import { runApiSync, resetSyncFailures } from "@/lib/sync";

/**
 * Data management card: reset local database and re-sync.
 * 一般設定のデータ管理カード（ローカルDBリセット）
 */
export function DataManagementCard() {
  const { t } = useTranslation();
  const { userId, getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const handleResetDatabase = useCallback(async () => {
    if (isResetting || !userId || !isSignedIn) return;
    setIsResetting(true);
    try {
      const adapter = createStorageAdapter();
      await adapter.initialize(userId);
      await adapter.resetDatabase();
      await adapter.initialize(userId);
      resetSyncFailures();
      await runApiSync(userId, getToken, { force: true, forceFullSyncWhenLocalEmpty: true });
      queryClient.invalidateQueries({ queryKey: pageKeys.all });
      toast.success(t("generalSettings.dataManagement.resetSuccess"));
    } catch (error) {
      console.error("Failed to reset database:", error);
      toast.error(t("generalSettings.dataManagement.resetFailed"));
    } finally {
      setIsResetting(false);
    }
  }, [isResetting, userId, isSignedIn, getToken, queryClient, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseZap className="h-5 w-5" />
          {t("generalSettings.dataManagement.title")}
        </CardTitle>
        <CardDescription>{t("generalSettings.dataManagement.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-destructive/40 p-4">
          <h3 className="text-sm font-semibold">
            {t("generalSettings.dataManagement.resetTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("generalSettings.dataManagement.resetDescription")}
          </p>
          <div className="mt-4 flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isResetting}>
                  {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("generalSettings.dataManagement.resetButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("generalSettings.dataManagement.resetConfirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("generalSettings.dataManagement.resetConfirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetDatabase} disabled={isResetting}>
                    {t("generalSettings.dataManagement.resetButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
