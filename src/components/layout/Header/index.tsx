import React from "react";
import Container from "@/components/layout/Container";
import { cn, SidebarTrigger, useIsMobile } from "@zedi/ui";
import { HeaderLogo } from "./HeaderLogo";
import { MonthNavigation } from "./MonthNavigation";
import { HeaderSearchBar } from "./HeaderSearchBar";
import { UnifiedMenu } from "./UnifiedMenu";
import { AIChatButton } from "./AIChatButton";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useGlobalSearchContextOptional } from "@/contexts/GlobalSearchContext";

interface HeaderProps {
  className?: string;
}

/**
 * Sticky app header. Hides the left sidebar trigger on mobile; navigation is available from the user menu sheet.
 * 固定ヘッダー。モバイルでは左サイドバートリガーを出さず、ナビはユーザーメニューのシートから利用。
 */
const Header: React.FC<HeaderProps> = ({ className }) => {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const searchContext = useGlobalSearchContextOptional();
  const hasSearchContext = searchContext != null;
  const isMobile = useIsMobile();

  return (
    <header
      className={cn(
        "border-border sticky top-0 z-50 border-b",
        "bg-background/95 supports-backdrop-filter:bg-background/60 backdrop-blur",
        className,
      )}
    >
      <Container className="flex h-18 items-center justify-between gap-4">
        {/* Left: Sidebar trigger (desktop only; mobile uses user-menu sheet for nav), Logo & Month Navigation */}
        {/* 左: サイドバートリガー（デスクトップのみ。モバイルはユーザーメニューシートでナビ）・ロゴ・月ナビ */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 md:gap-4">
          {!isMobile && <SidebarTrigger className="h-9 w-9" aria-label={t("nav.menu", "Menu")} />}
          <div className="hidden items-center gap-4 md:flex">
            <HeaderLogo />
            <MonthNavigation />
          </div>
        </div>

        {/* Center: Search bar & AI Chat button */}
        <div className="flex max-w-xl min-w-0 flex-1 items-center justify-center gap-2 md:mx-2">
          {hasSearchContext && <HeaderSearchBar />}
          <AIChatButton />
        </div>

        {/* Right: Unified menu */}
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
