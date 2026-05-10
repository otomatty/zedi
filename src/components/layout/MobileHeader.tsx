import React from "react";
import { cn } from "@zedi/ui";
import { HeaderSearchBar } from "./Header/HeaderSearchBar";
import { NoteSwitcher } from "./Header/NoteSwitcher";
import Container from "@/components/layout/Container";
import { useGlobalSearchContextOptional } from "@/contexts/GlobalSearchContext";
import { useHeaderActions } from "@/contexts/HeaderActionsContext";

interface MobileHeaderProps {
  className?: string;
}

/**
 * Compact mobile title bar that shows ONLY the search bar inline. Navigation,
 * AI toggle, and the user menu have moved to the bottom nav, so this bar
 * stays deliberately minimal (h-16) and surfaces the single most-used input
 * without an extra tap through a Sheet. The vertical padding around the
 * h-12 search input (py-2) gives the bar 8px breathing room above and below
 * so the input does not feel cramped on small viewports.
 *
 * モバイル用のコンパクトなタイトルバー。検索バーのみをインラインで表示する。
 * ナビゲーション・AI 開閉・ユーザーメニューはボトムナビへ移譲済みのため、
 * 高さ h-16 を維持しつつ、最も利用頻度の高い検索を Sheet を介さず直接操作で
 * きるようにしている。h-12 の検索入力の上下に py-2（8px）の余白を持たせて、
 * 小さなビューポートでも詰まった印象にならないようにしている。
 */
export const MobileHeader: React.FC<MobileHeaderProps> = ({ className }) => {
  const searchContext = useGlobalSearchContextOptional();
  const hasSearchContext = searchContext != null;
  const headerActions = useHeaderActions();

  return (
    <header
      className={cn(
        "border-border sticky top-0 z-50 h-16 border-b",
        "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur",
        className,
      )}
    >
      <Container className="flex h-16 items-center gap-1 py-2">
        <div
          ref={headerActions?.setLeftSlot ?? null}
          className="flex shrink-0 items-center gap-1 empty:hidden"
          data-testid="header-left-slot"
        />
        {/* Mobile NoteSwitcher: rendered as a compact icon trigger so the
            mobile bar still fits the search input in one row. The component
            collapses to a label-less icon button at this breakpoint and
            self-hides for signed-out users. Issue #827.
            モバイルの NoteSwitcher は、検索入力と 1 行に収まるよう
            コンパクトなアイコントリガーとして描画する。サインアウト中は
            内部で非表示になる。issue #827。 */}
        <NoteSwitcher />
        {hasSearchContext && (
          <div className="min-w-0 flex-1">
            <HeaderSearchBar />
          </div>
        )}
        <div
          ref={headerActions?.setRightSlot ?? null}
          className="flex shrink-0 items-center gap-1 empty:hidden"
          data-testid="header-right-slot"
        />
      </Container>
    </header>
  );
};

export default MobileHeader;
