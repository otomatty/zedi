import React from "react";
import Container from "@/components/layout/Container";
import { cn } from "@zedi/ui";
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

const Header: React.FC<HeaderProps> = ({ className }) => {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const searchContext = useGlobalSearchContextOptional();
  const hasSearchContext = searchContext != null;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className,
      )}
    >
      <Container className="flex h-[4.5rem] items-center justify-between gap-4">
        {/* Left: Logo & Month Navigation（モバイルでは非表示にして検索バー左の余白を防ぐ） */}
        <div className="hidden min-w-0 shrink-0 items-center gap-4 sm:flex">
          <HeaderLogo />
          <MonthNavigation />
        </div>

        {/* Center: Search bar & AI Chat button */}
        <div className="flex min-w-0 max-w-xl flex-1 items-center justify-center gap-2 sm:mx-2">
          {hasSearchContext && <HeaderSearchBar />}
          <AIChatButton />
        </div>

        {/* Right: Unified menu */}
        <div className="flex shrink-0 items-center gap-2">
          {!isSignedIn && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
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
