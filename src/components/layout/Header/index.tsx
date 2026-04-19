import React from "react";
import Container from "@/components/layout/Container";
import { cn } from "@zedi/ui";
import { HeaderLogo } from "./HeaderLogo";
import { MonthNavigation } from "./MonthNavigation";
import { HeaderSearchBar } from "./HeaderSearchBar";
import { PrimaryNav } from "./PrimaryNav";
import { UnifiedMenu } from "./UnifiedMenu";
import { AIChatButton } from "./AIChatButton";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useGlobalSearchContextOptional } from "@/contexts/GlobalSearchContext";

interface HeaderProps {
  className?: string;
}

/**
 * Sticky app header. Hosts the logo, primary functional navigation
 * (Home / Notes), the search bar, the AI chat toggle and a user-only menu.
 *
 * 固定ヘッダー。ロゴ、主要な機能ナビゲーション（Home / Notes）、検索、
 * AI チャットの開閉、そしてユーザー情報専用のメニューを並べる。
 */
const Header: React.FC<HeaderProps> = ({ className }) => {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const searchContext = useGlobalSearchContextOptional();
  const hasSearchContext = searchContext != null;

  return (
    <header
      className={cn(
        "border-border sticky top-0 z-50 border-b",
        "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur",
        className,
      )}
    >
      <Container className="flex h-[4.5rem] items-center justify-between gap-3 md:gap-4">
        {/* Left: Logo, Month Navigation and primary functional nav (Home / Notes).
            左: ロゴ・月ナビ・主要な機能ナビゲーション（Home / Notes）。 */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 md:gap-3">
          <div className="hidden items-center gap-3 md:flex">
            <HeaderLogo />
            <MonthNavigation />
          </div>
          <PrimaryNav />
        </div>

        {/* Center: Search bar & AI Chat button.
            中央: 検索バーと AI チャットボタン。 */}
        <div className="flex max-w-xl min-w-0 flex-1 items-center justify-center gap-2 md:mx-2">
          {hasSearchContext && <HeaderSearchBar />}
          <AIChatButton />
        </div>

        {/* Right: User-only menu (account, sync status, sign in/out).
            右: ユーザー専用メニュー（アカウント・同期状態・サインイン/アウト）。 */}
        <div className="flex shrink-0 items-center gap-2">
          {!isSignedIn && (
            <span className="text-muted-foreground hidden text-xs md:inline">
              {t("common.guestSyncPrompt")}
            </span>
          )}
          <UnifiedMenu />
        </div>
      </Container>
    </header>
  );
};

export default Header;
