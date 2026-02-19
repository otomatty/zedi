import { Cloud, CloudOff, Loader2, Check } from "lucide-react";
import { useSyncStatus, useSync } from "@/hooks/usePageQueries";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
