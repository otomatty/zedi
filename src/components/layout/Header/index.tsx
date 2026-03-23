import React from "react";
import Container from "@/components/layout/Container";
import { cn, SidebarTrigger } from "@zedi/ui";
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
 *
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
      <Container className="flex h-[4.5rem] items-center justify-between gap-4">
        {/* Left: Sidebar trigger, then Logo & Month Navigation（モバイルではロゴ・月ナビ非表示） */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-4">
          <SidebarTrigger className="h-9 w-9" aria-label={t("nav.menu", "Menu")} />
          <div className="hidden items-center gap-4 sm:flex">
            <HeaderLogo />
            <MonthNavigation />
          </div>
        </div>

        {/* Center: Search bar & AI Chat button */}
        <div className="flex max-w-xl min-w-0 flex-1 items-center justify-center gap-2 sm:mx-2">
          {hasSearchContext && <HeaderSearchBar />}
          <AIChatButton />
        </div>

        {/* Right: Unified menu */}
        <div className="flex shrink-0 items-center gap-2">
          {!isSignedIn && (
            <span className="text-muted-foreground hidden text-xs sm:inline">
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
