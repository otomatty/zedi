import { Cloud, CloudOff, Loader2, Check, DatabaseZap } from "lucide-react";
import { useSyncStatus, useSync } from "@/hooks/usePageQueries";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@zedi/ui";
import { Button } from "@zedi/ui";
import { cn } from "@zedi/ui/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * Sync status indicator for the header
 * Shows sync status for authenticated users using Embedded Replicas
 */
export function SyncIndicator() {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const syncStatus = useSyncStatus();
  const { sync, isSyncing } = useSync();

  // Only show for authenticated users
  if (!isSignedIn) {
    return null;
  }

  const statusConfig = {
    idle: {
      icon: Cloud,
      label: t("common.syncIdleLabel"),
      description: t("common.syncIdleDescription"),
      className: "text-muted-foreground",
    },
    syncing: {
      icon: Loader2,
      label: t("common.syncSyncingLabel"),
      description: t("common.syncSyncingDescription"),
      className: "text-blue-500 animate-spin",
    },
    synced: {
      icon: Check,
      label: t("common.syncSyncedLabel"),
      description: t("common.syncSyncedDescription"),
      className: "text-green-500",
    },
    error: {
      icon: CloudOff,
      label: t("common.syncErrorLabel"),
      description: t("common.syncErrorDescription"),
      className: "text-destructive",
    },
    "db-resuming": {
      icon: DatabaseZap,
      label: t("common.syncDbResumingLabel", "DB starting…"),
      description: t(
        "common.syncDbResumingDescription",
        "Database is waking up. Please wait a moment.",
      ),
      className: "text-amber-500 animate-pulse",
    },
  };

  const config = statusConfig[syncStatus];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={sync}
            disabled={isSyncing || syncStatus === "syncing"}
          >
            <Icon className={cn("h-5 w-5", config.className)} />
            <span className="sr-only">{config.label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-medium">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
