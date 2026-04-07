/**
 * スナップショット一覧（左パネル）
 * Snapshot list panel (left side of the history modal)
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollArea, Badge } from "@zedi/ui";
import { formatTimeAgo } from "@/lib/dateUtils";
import type { PageSnapshot } from "@/types/pageSnapshot";

interface SnapshotListProps {
  snapshots: PageSnapshot[];
  selectedId: string | null;
  onSelect: (snapshot: PageSnapshot) => void;
}

/**
 *
 */
export /**
 *
 */
const SnapshotList: React.FC<SnapshotListProps> = ({ snapshots, selectedId, onSelect }) => {
  /**
   *
   */
  const { t } = useTranslation();

  if (snapshots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <p className="text-muted-foreground text-sm font-medium">
          {t("editor.pageHistory.noSnapshots")}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {t("editor.pageHistory.noSnapshotsDescription")}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {snapshots.map((snap) => {
          /**
           *
           */
          const isSelected = snap.id === selectedId;
          /**
           *
           */
          const date = new Date(snap.createdAt);

          return (
            <button
              key={snap.id}
              type="button"
              onClick={() => onSelect(snap)}
              className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50 border-transparent"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {t("editor.pageHistory.version", { version: snap.version })}
                </span>
                <Badge
                  variant={snap.trigger === "restore" ? "secondary" : "outline"}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {t(`editor.pageHistory.${snap.trigger}`)}
                </Badge>
              </div>
              <div className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <time dateTime={snap.createdAt} title={date.toLocaleString()}>
                  {formatTimeAgo(date.getTime())}
                </time>
                {snap.createdByEmail && (
                  <>
                    <span>·</span>
                    <span className="truncate">{snap.createdByEmail}</span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
};
