import { Cloud, CloudOff, Loader2, Check } from "lucide-react";
import { useSyncStatus, useSync } from "@/hooks/usePageQueries";
import { useAuth } from "@clerk/clerk-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sync status indicator for the header
 * Shows sync status for authenticated users using Embedded Replicas
 */
export function SyncIndicator() {
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
      label: "クラウド同期",
      description: "クリックして同期",
      className: "text-muted-foreground",
    },
    syncing: {
      icon: Loader2,
      label: "同期中...",
      description: "データを同期しています",
      className: "text-blue-500 animate-spin",
    },
    synced: {
      icon: Check,
      label: "同期完了",
      description: "すべてのデータが同期されています",
      className: "text-green-500",
    },
    error: {
      icon: CloudOff,
      label: "同期エラー",
      description: "同期に失敗しました。クリックして再試行",
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
            className="h-8 w-8"
            onClick={sync}
            disabled={isSyncing || syncStatus === "syncing"}
          >
            <Icon className={cn("h-4 w-4", config.className)} />
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
