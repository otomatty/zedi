import { useTranslation } from "react-i18next";

/** Relative widths (of full bubble width). Parent must be `w-full`. / バブル全幅に対する相対幅（親は `w-full` 必須） */
const SKELETON_LINE_WIDTH_CLASSES = ["w-[95%]", "w-[75%]", "w-[85%]", "w-[45%]"] as const;

/**
 * Bar styles on `bg-muted` bubbles: avoid muted-on-muted; use foreground tint + inset ring.
 * `bg-muted` 上では muted 系を避け、foreground の薄い塗りとリングでコントラストを確保する。
 */
const SKELETON_BAR_CLASS =
  "h-3 max-w-full animate-pulse rounded-md bg-foreground/14 ring-1 ring-inset ring-foreground/10 dark:bg-foreground/18 dark:ring-foreground/15";

/**
 * Placeholder lines shown while the assistant reply is streaming but no text has arrived yet.
 * アシスタント応答がストリーミング中で、まだ本文が届いていない間に表示するプレースホルダー。
 */
export function AIChatMessageSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      className="w-full min-w-0 space-y-2 py-0.5"
      data-testid="ai-chat-message-skeleton"
      aria-busy="true"
      aria-live="polite"
      aria-label={t("aiChat.messages.loadingSkeleton")}
    >
      {SKELETON_LINE_WIDTH_CLASSES.map((widthClass) => (
        <div key={widthClass} className={`${SKELETON_BAR_CLASS} ${widthClass}`} />
      ))}
    </div>
  );
}
