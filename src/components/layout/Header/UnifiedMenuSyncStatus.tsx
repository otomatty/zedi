import React, { useCallback } from "react";
import { Cloud, CloudOff, Loader2, Check, DatabaseZap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSyncStatus, useSync } from "@/hooks/usePageQueries";
import { useTranslation } from "react-i18next";
import { cn, DropdownMenuItem, DropdownMenuSeparator } from "@zedi/ui";

type SyncStatusKey = "idle" | "syncing" | "synced" | "error" | "db-resuming";

function useSyncStatusConfig() {
  const { t } = useTranslation();

  const configs: Record<
    SyncStatusKey,
    {
      icon: React.FC<{ className?: string }>;
      label: string;
      description: string;
      dotColor: string;
      iconClassName: string;
    }
  > = {
    idle: {
      icon: Cloud,
      label: t("common.syncIdleLabel"),
      description: t("common.syncIdleDescription"),
      dotColor: "bg-muted-foreground",
      iconClassName: "text-muted-foreground",
    },
    syncing: {
      icon: Loader2,
      label: t("common.syncSyncingLabel"),
      description: t("common.syncSyncingDescription"),
      dotColor: "bg-blue-500 animate-pulse",
      iconClassName: "text-blue-500 animate-spin",
    },
    synced: {
      icon: Check,
      label: t("common.syncSyncedLabel"),
      description: t("common.syncSyncedDescription"),
      dotColor: "bg-green-500",
      iconClassName: "text-green-500",
    },
    error: {
      icon: CloudOff,
      label: t("common.syncErrorLabel"),
      description: t("common.syncErrorDescription"),
      dotColor: "bg-destructive",
      iconClassName: "text-destructive",
    },
    "db-resuming": {
      icon: DatabaseZap,
      label: t("common.syncDbResumingLabel", "DB starting…"),
      description: t(
        "common.syncDbResumingDescription",
        "Database is waking up. Please wait a moment.",
      ),
      dotColor: "bg-amber-500 animate-pulse",
      iconClassName: "text-amber-500 animate-pulse",
    },
  };

  return configs;
}

interface SyncStatusRowProps {
  /** Render in a dropdown menu or a regular stacked list. / ドロップダウンか通常リストか */
  variant?: "list" | "dropdown";
  /** Optional close callback for parent menu/sheet. / 親メニューを閉じるためのコールバック */
  onClose?: () => void;
}

/**
 * Sync status row inside user menu (idle / syncing / synced / error / db-resuming).
 * ユーザーメニュー内の同期ステータス行。
 */
export const SyncStatusRow: React.FC<SyncStatusRowProps> = ({ variant = "list", onClose }) => {
  const { isSignedIn } = useAuth();
  const syncStatus = useSyncStatus();
  const { sync, isSyncing } = useSync();
  const configs = useSyncStatusConfig();
  const isDisabled = isSyncing || syncStatus === "syncing";
  const handleSync = useCallback(() => {
    if (isDisabled) return;
    sync();
    onClose?.();
  }, [isDisabled, onClose, sync]);

  if (!isSignedIn) return null;

  const config = configs[syncStatus];
  const Icon = config.icon;

  if (variant === "dropdown") {
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isDisabled} onSelect={handleSync} className="gap-3 px-3 py-2">
          <Icon className={cn("h-4 w-4 shrink-0", config.iconClassName)} />
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-xs font-medium">{config.label}</span>
            <span className="text-muted-foreground truncate text-[11px]">{config.description}</span>
          </div>
        </DropdownMenuItem>
      </>
    );
  }

  return (
    <>
      <hr className="border-border my-1" />
      <div className="px-2 py-1.5">
        <button
          type="button"
          onClick={handleSync}
          disabled={isDisabled}
          className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon className={cn("h-4 w-4 shrink-0", config.iconClassName)} />
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-xs font-medium">{config.label}</span>
            <span className="text-muted-foreground truncate text-[11px]">{config.description}</span>
          </div>
        </button>
      </div>
    </>
  );
};

/**
 * Sync status dot color for the avatar trigger badge.
 * アバタートリガーのバッジ用同期ステータスドットの色。
 */
export function useSyncStatusDotColor(): string | undefined {
  const { isSignedIn } = useAuth();
  const syncStatus = useSyncStatus();
  const configs = useSyncStatusConfig();
  return isSignedIn ? configs[syncStatus].dotColor : undefined;
}
