import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash2, MoreHorizontal, Download, Copy, History } from "lucide-react";
import { Button, cn } from "@zedi/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@zedi/ui";
import Container from "@/components/layout/Container";
import { useTranslation } from "react-i18next";
import { formatTimeAgo } from "@/lib/dateUtils";
import { ConnectionIndicator } from "../ConnectionIndicator";
import { UserAvatars } from "../UserAvatars";
import type { ConnectionStatus } from "@/lib/collaboration/types";
import type { UserPresence } from "@/lib/collaboration/types";

/**
 * 上下スクロール判定で誤反応を避けるための最小デルタ(px)。
 * Minimum scroll delta (px) before toggling header visibility.
 */
const SCROLL_DELTA_THRESHOLD = 6;
/**
 * この値以下のスクロール位置では常にヘッダーを表示する。
 * Always show the header when the scroll position is within this many px from top.
 */
const SHOW_AT_TOP_PX = 8;

function isScrollableElement(el: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

/**
 * 与えた要素配下から、実際にスクロール可能な要素を深さ優先で探す。
 * Depth-first search for an actually-scrollable descendant element.
 */
function findScrollableDescendant(el: HTMLElement): HTMLElement | null {
  if (isScrollableElement(el) && el.scrollHeight > el.clientHeight) return el;
  for (const child of Array.from(el.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const found = findScrollableDescendant(child);
    if (found) return found;
  }
  if (isScrollableElement(el)) return el;
  return null;
}

/**
 * ヘッダーのスクロール監視対象を解決する。
 * 祖先 → 兄弟要素配下 → window の順で最も近いスクロールコンテナを返す。
 * 通常は `ContentWithAIChat` 内の overflow-y-auto なラッパー（祖先）に該当する。
 *
 * Resolve the scroll container for the header. Walks ancestors first
 * (the typical case: the overflow-y-auto wrapper inside ContentWithAIChat),
 * then sibling subtrees, then falls back to the window.
 */
function findScrollContainer(headerEl: HTMLElement): HTMLElement | Window {
  let el: HTMLElement | null = headerEl.parentElement;
  while (el && el !== document.body) {
    if (isScrollableElement(el)) return el;
    el = el.parentElement;
  }
  const parent = headerEl.parentElement;
  if (parent) {
    for (const sibling of Array.from(parent.children)) {
      if (sibling === headerEl || !(sibling instanceof HTMLElement)) continue;
      const found = findScrollableDescendant(sibling);
      if (found) return found;
    }
  }
  return window;
}

function getScrollTop(target: HTMLElement | Window): number {
  return target instanceof Window ? window.scrollY : target.scrollTop;
}

interface PageEditorHeaderProps {
  lastSaved: number | null;
  onBack: () => void;
  onDelete: () => void;
  onExportMarkdown: () => void;
  onCopyMarkdown: () => void;
  /** 変更履歴モーダルを開く / Open version history modal */
  onOpenHistory?: () => void;
  /** リアルタイムコラボレーション状態（有効時のみ渡す） */
  collaboration?: {
    status: ConnectionStatus;
    isSynced: boolean;
    onlineUsers: UserPresence[];
    onReconnect: () => void;
  };
}

/**
 * Page-specific toolbar for PageEditor. Shown below the common `Header`
 * (which already provides search / UnifiedMenu), so this toolbar only
 * contains editor-specific actions (back, collaboration status, more menu).
 *
 * PageEditor のページ固有ツールバー。検索・ユーザーメニューは共通 `Header`
 * 側で提供されるため、ここではエディタ固有の操作（戻る・コラボ・その他メニュー）のみ。
 */
export const PageEditorHeader: React.FC<PageEditorHeaderProps> = ({
  lastSaved,
  onBack,
  onDelete,
  onExportMarkdown,
  onCopyMarkdown,
  onOpenHistory,
  collaboration,
}) => {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const target = findScrollContainer(el);
    let lastY = getScrollTop(target);

    const handleScroll = () => {
      const current = getScrollTop(target);
      const delta = current - lastY;
      if (current <= SHOW_AT_TOP_PX) {
        setHidden(false);
      } else if (delta > SCROLL_DELTA_THRESHOLD) {
        setHidden(true);
      } else if (delta < -SCROLL_DELTA_THRESHOLD) {
        setHidden(false);
      }
      lastY = current;
    };

    target.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "bg-background/70 supports-[backdrop-filter]:bg-background/50 sticky top-0 z-20 backdrop-blur transition-transform duration-300 ease-in-out",
        hidden ? "-translate-y-full" : "translate-y-0",
      )}
    >
      <Container className="flex items-center justify-between gap-4 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-12 w-12 shrink-0">
          <ArrowLeft />
        </Button>

        <div className="flex items-center gap-2">
          {/* リアルタイムコラボ: 接続状態・オンラインユーザー */}
          {collaboration && (
            <>
              <ConnectionIndicator
                status={collaboration.status}
                isSynced={collaboration.isSynced}
                onReconnect={collaboration.onReconnect}
                className="shrink-0"
              />
              <UserAvatars users={collaboration.onlineUsers} className="shrink-0" />
            </>
          )}
          {lastSaved && (
            <span className="text-muted-foreground hidden text-xs sm:inline">
              {formatTimeAgo(lastSaved)}に保存
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-12 w-12">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onOpenHistory && (
                <DropdownMenuItem onClick={onOpenHistory}>
                  <History className="mr-2 h-4 w-4" />
                  {t("editor.pageHistory.menuButton")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onExportMarkdown}>
                <Download className="mr-2 h-4 w-4" />
                Markdownでエクスポート
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyMarkdown}>
                <Copy className="mr-2 h-4 w-4" />
                Markdownをコピー
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Container>
    </div>
  );
};
