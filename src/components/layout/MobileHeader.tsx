import React from "react";
import { cn } from "@zedi/ui";
import { HeaderSearchBar } from "./Header/HeaderSearchBar";
import Container from "@/components/layout/Container";
import { useGlobalSearchContextOptional } from "@/contexts/GlobalSearchContext";

interface MobileHeaderProps {
  className?: string;
}

/**
 * Compact mobile title bar that shows ONLY the search bar inline. Navigation,
 * AI toggle, and the user menu have moved to the bottom nav, so this bar
 * stays deliberately minimal (h-14) and surfaces the single most-used input
 * without an extra tap through a Sheet. The slight vertical padding around
 * the h-12 search input prevents the bar from feeling cramped on small
 * viewports.
 *
 * モバイル用のコンパクトなタイトルバー。検索バーのみをインラインで表示する。
 * ナビゲーション・AI 開閉・ユーザーメニューはボトムナビへ移譲済みのため、
 * 高さ h-14 を維持しつつ、最も利用頻度の高い検索を Sheet を介さず直接操作で
 * きるようにしている。h-12 の検索入力の上下にわずかな余白を持たせて、
 * 小さなビューポートでも詰まった印象にならないようにしている。
 */
export const MobileHeader: React.FC<MobileHeaderProps> = ({ className }) => {
  const searchContext = useGlobalSearchContextOptional();
  const hasSearchContext = searchContext != null;

  return (
    <header
      className={cn(
        "border-border sticky top-0 z-50 h-14 border-b",
        "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur",
        className,
      )}
    >
      <Container className="flex h-14 items-center">
        {hasSearchContext && (
          <div className="min-w-0 flex-1 py-1">
            <HeaderSearchBar />
          </div>
        )}
      </Container>
    </header>
  );
};

export default MobileHeader;
