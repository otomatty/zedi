import React from "react";
import Container from "@/components/layout/Container";
import { SyncIndicator } from "@/components/layout/SyncIndicator";
import { cn } from "@/lib/utils";
import { HeaderLogo } from "./HeaderLogo";
import { MonthNavigation } from "./MonthNavigation";
import { AppsMenu } from "./AppsMenu";
import { UserMenu } from "./UserMenu";

interface HeaderProps {
  className?: string;
}

const Header: React.FC<HeaderProps> = ({ className }) => (
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

      {/* Right: Sync, Apps menu, Auth */}
      <div className="flex items-center gap-2">
        <SyncIndicator />
        <AppsMenu />
        <UserMenu />
      </div>
    </Container>
  </header>
);

export default Header;
