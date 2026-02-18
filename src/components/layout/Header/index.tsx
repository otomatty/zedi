import React from "react";
import { Search } from "lucide-react";
import Container from "@/components/layout/Container";
import { SyncIndicator } from "@/components/layout/SyncIndicator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HeaderLogo } from "./HeaderLogo";
import { MonthNavigation } from "./MonthNavigation";
import { HeaderSearchBar } from "./HeaderSearchBar";
import { AppsMenu } from "./AppsMenu";
import { UserMenu } from "./UserMenu";
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
  const openSearch = searchContext?.open;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        {/* Left: Logo & Month Navigation */}
        <div className="flex items-center gap-4 min-w-0">
          <HeaderLogo />
          <MonthNavigation />
        </div>

        {/* Center: Search bar or icon (when inside GlobalSearchProvider) */}
        {hasSearchContext && (
          <>
            <div className="hidden sm:flex flex-1 justify-center min-w-0 max-w-xl mx-2">
              <HeaderSearchBar />
            </div>
            <div className="flex sm:hidden">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openSearch?.()}
                aria-label="ページを検索"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {/* Right: Sync, Apps menu, Auth (guest: login prompt + Sign In) */}
        <div className="flex items-center gap-2 shrink-0">
          <SyncIndicator />
          <AppsMenu />
          {!isSignedIn && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {t("common.guestSyncPrompt")}
            </span>
          )}
          <UserMenu />
        </div>
      </Container>
    </header>
  );
};

export default Header;
