import React from "react";
import Container from "@/components/layout/Container";
import { SyncIndicator } from "@/components/layout/SyncIndicator";
import { cn } from "@/lib/utils";
import { HeaderLogo } from "./HeaderLogo";
import { MonthNavigation } from "./MonthNavigation";
import { AppsMenu } from "./AppsMenu";
import { UserMenu } from "./UserMenu";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  className?: string;
}

const Header: React.FC<HeaderProps> = ({ className }) => {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();

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
        <div className="flex items-center gap-4">
          <HeaderLogo />
          <MonthNavigation />
        </div>

        {/* Right: Sync, Apps menu, Auth (guest: login prompt + Sign In) */}
        <div className="flex items-center gap-2">
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
