import React from "react";
import Container from "@/components/layout/Container";
import { cn } from "@/lib/utils";
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
        className
      )}
    >
      <Container className="flex h-[4.5rem] items-center justify-between gap-4">
        {/* Left: Logo & Month Navigation（モバイルでは非表示にして検索バー左の余白を防ぐ） */}
        <div className="hidden sm:flex items-center gap-4 min-w-0 shrink-0">
          <HeaderLogo />
          <MonthNavigation />
        </div>

        {/* Center: Search bar（モバイルでは先頭に表示） */}
        {hasSearchContext && (
          <div className="flex flex-1 justify-center min-w-0 max-w-xl sm:mx-2">
            <HeaderSearchBar />
          </div>
        )}

        {/* Right: AI Chat button & Unified menu */}
        <div className="flex items-center gap-2 shrink-0">
          {!isSignedIn && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {t("common.guestSyncPrompt")}
            </span>
          )}
          <AIChatButton />
          <UnifiedMenu />
        </div>
      </Container>
    </header>
  );
};

export default Header;
