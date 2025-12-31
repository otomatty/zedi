import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import SearchBar from "@/components/search/SearchBar";
import { cn } from "@/lib/utils";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";

interface HeaderProps {
  className?: string;
}

const Header: React.FC<HeaderProps> = ({ className }) => {
  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date())
  );

  const monthLabel = useMemo(() => {
    return format(currentMonth, "yyyy年M月", { locale: ja });
  }, [currentMonth]);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-4">
        {/* Logo & Month Navigation */}
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Zedi
          </h1>

          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-muted-foreground min-w-[100px] text-center">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleNextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search & Auth */}
        <div className="flex items-center gap-4">
          <SearchBar className="w-full max-w-xs sm:max-w-sm" />

          {/* Authentication */}
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="outline" size="sm">
                サインイン
              </Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </SignedIn>
        </div>
      </div>
    </header>
  );
};

export default Header;
