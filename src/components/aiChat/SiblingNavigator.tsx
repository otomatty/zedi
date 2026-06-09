import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * Props for {@link SiblingNavigator}.
 * {@link SiblingNavigator} の props。
 */
export interface SiblingNavigatorProps {
  /** 0-based index of the visible sibling. / 表示中の兄弟の 0 始まりインデックス */
  currentIndex: number;
  /** Number of sibling branches. / 兄弟ブランチ数 */
  total: number;
  /** Switch to previous or next sibling (wraps). / 前後の兄弟へ（循環） */
  onSwitch: (direction: "prev" | "next") => void;
  /** Optional root class. / ルートの追加クラス */
  className?: string;
}

/**
 * Compact prev/next control for alternate message branches (regenerate / edit).
 * 再生成・編集などで分岐したメッセージの前後切り替え UI。
 */
export function SiblingNavigator({
  currentIndex,
  total,
  onSwitch,
  className,
}: SiblingNavigatorProps) {
  const { t } = useTranslation();
  if (total <= 1) {
    return null;
  }
  return (
    <div
      className={cn("text-muted-foreground flex items-center gap-1 text-xs", className)}
      data-testid="sibling-navigator"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => onSwitch("prev")}
        aria-label={t("aiChat.branch.prev", "Previous branch")}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[3ch] text-center tabular-nums">
        {currentIndex + 1}/{total}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => onSwitch("next")}
        aria-label={t("aiChat.branch.next", "Next branch")}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
