import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
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
  while (el) {
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

/**
 * ページ詳細ツールバーのアクションメニュー項目。`/pages/:id` と
 * `/notes/:noteId/:pageId` で共通の見た目・スクロール挙動を再利用しつつ、
 * メニュー項目だけは呼び出し側が定義できるようにする。
 *
 * Menu item for the shared page-detail toolbar. Lets `/pages/:id` and
 * `/notes/:noteId/:pageId` share layout / scroll behaviour while letting the
 * caller decide which actions are exposed in the more-actions menu.
 */
export interface PageDetailToolbarAction {
  /** Stable identifier used as the React key and for testing hooks. */
  id: string;
  /** Visible label / aria label. */
  label: string;
  /** Optional leading icon component (e.g. `Trash2`, `Download`). */
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  /** Apply destructive styling (red text). */
  destructive?: boolean;
  /** Render a visual separator immediately before this item. */
  separatorBefore?: boolean;
}

interface PageEditorHeaderProps {
  /**
   * 最終保存時刻のタイムスタンプ。指定したときだけ「○○前に保存」を表示する。
   * 閲覧専用やノート側のように保存時刻を持たないページ詳細では未指定でよい。
   *
   * Last-saved timestamp. The savedAt label is only shown when this is set,
   * so read-only or note-detail callers without a save timestamp can omit it.
   */
  lastSaved?: number | null;
  onBack: () => void;
  /**
   * ドロップダウンメニューに表示するアクション。空または未指定なら
   * 「…」ボタン自体を出さない。
   *
   * Items in the more-actions dropdown. The trigger button is hidden when
   * this is empty or undefined, so callers that have no actions get a clean
   * toolbar with just the back button (plus any supplemental content).
   */
  menuItems?: PageDetailToolbarAction[];
  /**
   * 戻るボタンと「…」メニューの間に並べる追加コンテンツ。閲覧専用ラベルや
   * カスタムボタンを差し込むためのスロット。
   *
   * Extra content rendered between the back button and the more-actions
   * menu. Use it for things like the "閲覧専用" badge on note pages.
   */
  supplementalRightContent?: React.ReactNode;
  /** リアルタイムコラボレーション状態（有効時のみ渡す） */
  collaboration?: {
    status: ConnectionStatus;
    isSynced: boolean;
    onlineUsers: UserPresence[];
    onReconnect: () => void;
  };
}

/**
 * 共通ヘッダー直下に並べるページ詳細用ツールバー。`/pages/:id` と
 * `/notes/:noteId/:pageId` の両方で同じ sticky / scroll-hide / inert 挙動を
 * 共有するための薄いコンポーネント。
 *
 * Shared page-detail toolbar shown below the global `Header`. Both
 * `/pages/:id` and `/notes/:noteId/:pageId` reuse this component so they
 * share the same sticky / scroll-hide / inert focus behaviour; only the
 * action menu items and supplemental content differ.
 */
export const PageEditorHeader: React.FC<PageEditorHeaderProps> = ({
  lastSaved,
  onBack,
  menuItems,
  supplementalRightContent,
  collaboration,
}) => {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const target = findScrollContainer(el);
    let anchorY = getScrollTop(target);

    const handleScroll = () => {
      const current = getScrollTop(target);
      if (current <= SHOW_AT_TOP_PX) {
        setHidden(false);
        anchorY = current;
        return;
      }

      const delta = current - anchorY;
      if (delta > SCROLL_DELTA_THRESHOLD) {
        setHidden(true);
        anchorY = current;
      } else if (delta < -SCROLL_DELTA_THRESHOLD) {
        setHidden(false);
        anchorY = current;
      }
    };

    target.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    el.inert = hidden;
    if (!hidden) return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && el.contains(activeElement)) {
      activeElement.blur();
    }
  }, [hidden]);

  const hasMenu = Boolean(menuItems && menuItems.length > 0);

  return (
    <div
      ref={wrapperRef}
      aria-hidden={hidden || undefined}
      className={cn(
        "bg-background/70 supports-[backdrop-filter]:bg-background/50 sticky top-0 z-20 backdrop-blur transition-transform duration-300 ease-in-out",
        hidden ? "pointer-events-none -translate-y-full" : "translate-y-0",
      )}
    >
      <Container className="flex items-center justify-between gap-4 py-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label={t("common.back", "Back")}
          className="h-12 w-12 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
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
              {t("editor.savedAt", { relative: formatTimeAgo(lastSaved) })}
            </span>
          )}

          {supplementalRightContent}

          {hasMenu && menuItems && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.moreActions", "More actions")}
                  className="h-12 w-12"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <React.Fragment key={item.id}>
                      {item.separatorBefore && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={item.onClick}
                        disabled={item.disabled}
                        className={
                          item.destructive ? "text-destructive focus:text-destructive" : undefined
                        }
                      >
                        {Icon && <Icon className="mr-2 h-4 w-4" />}
                        {item.label}
                      </DropdownMenuItem>
                    </React.Fragment>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Container>
    </div>
  );
};
