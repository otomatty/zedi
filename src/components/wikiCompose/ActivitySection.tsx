/**
 * `ActivitySection` — agent activity timeline (#950).
 *
 * Compose 右ペイン下部のアクティビティタイムライン。SSE で来るツール呼び出し /
 * 調査イテレーション / フェーズ遷移を時系列で表示し、エージェントが何を
 * しているかを可視化する。Compose 中盤の「無音」を避けるための重要な UI。
 *
 * Read-only timeline. Newest entries at the bottom. Auto-scrolls into view
 * when new rows arrive.
 */
import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@zedi/ui";
import { cn } from "@zedi/ui";
import { Check, Circle, AlertCircle, Loader2 } from "lucide-react";
import type { ComposeActivity } from "@/hooks/wiki/useWikiComposeSession";

export interface ActivitySectionProps {
  activity: ComposeActivity[];
  isStreaming: boolean;
}

function Icon({ status }: { status: ComposeActivity["status"] }) {
  switch (status) {
    case "started":
      return <Loader2 className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />;
    case "completed":
      return <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />;
    case "error":
      return <AlertCircle className="h-3 w-3 text-red-600 dark:text-red-400" />;
    default:
      return <Circle className="text-muted-foreground h-3 w-3" />;
  }
}

/** Compact activity timeline. */
export const ActivitySection: React.FC<ActivitySectionProps> = ({ activity, isStreaming }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom on every new entry so the user sees the latest work.
  // 新規イベント到着時に末尾までスクロール。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activity]);

  return (
    <section data-testid="activity-section" className="border-border border-t pt-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("wikiCompose.activity.title")}
        </h3>
        {isStreaming ? (
          <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
            <Loader2 className="h-3 w-3 animate-spin" /> {t("wikiCompose.activity.live")}
          </span>
        ) : null}
      </header>
      <ScrollArea className="max-h-48">
        <div ref={containerRef} className="space-y-1 pr-2">
          {activity.length === 0 ? (
            <p className="text-muted-foreground text-xs italic">
              {t("wikiCompose.activity.empty")}
            </p>
          ) : (
            activity.map((entry) => (
              <div
                key={entry.id}
                data-testid={`activity-row-${entry.id}`}
                className={cn(
                  "flex items-start gap-2 text-xs",
                  entry.status === "error" && "text-red-600 dark:text-red-400",
                )}
              >
                <div className="mt-0.5 shrink-0">
                  <Icon status={entry.status} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{entry.label}</div>
                  {entry.detail ? (
                    <div className="text-muted-foreground truncate text-[11px]">{entry.detail}</div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </section>
  );
};
