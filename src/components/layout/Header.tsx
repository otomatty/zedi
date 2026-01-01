import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  LogOut,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import Container from "@/components/layout/Container";
import { KeyboardShortcutsDialog } from "@/components/layout/KeyboardShortcutsDialog";
import { cn } from "@/lib/utils";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  useUser,
  useClerk,
} from "@clerk/clerk-react";

interface HeaderProps {
  className?: string;
  onShowShortcuts?: () => void;
  shortcutsOpen?: boolean;
  onShortcutsOpenChange?: (open: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({
  className,
  onShowShortcuts,
  shortcutsOpen = false,
  onShortcutsOpenChange,
}) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useClerk();

  // Local state for shortcuts dialog if not controlled externally
  const [localShortcutsOpen, setLocalShortcutsOpen] = useState(false);
  const isShortcutsOpen = onShortcutsOpenChange
    ? shortcutsOpen
    : localShortcutsOpen;
  const setShortcutsOpen = onShortcutsOpenChange ?? setLocalShortcutsOpen;

  const handleShowShortcuts = () => {
    if (onShowShortcuts) {
      onShowShortcuts();
    } else {
      setShortcutsOpen(true);
    }
  };

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
      <Container className="flex h-16 items-center justify-between gap-4">
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

        {/* Shortcuts & Auth */}
        <div className="flex items-center gap-2">
          {/* Keyboard Shortcuts Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleShowShortcuts}
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                ショートカット一覧{" "}
                <kbd className="ml-1 px-1 py-0.5 text-xs bg-muted rounded">
                  ⌘/
                </kbd>
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Authentication */}
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="outline" size="sm">
                サインイン
              </Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user?.imageUrl}
                      alt={user?.fullName ?? "User"}
                    />
                    <AvatarFallback>
                      {user?.firstName?.charAt(0) ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    {user?.fullName && (
                      <p className="font-medium">{user.fullName}</p>
                    )}
                    {user?.primaryEmailAddress && (
                      <p className="text-xs text-muted-foreground">
                        {user.primaryEmailAddress.emailAddress}
                      </p>
                    )}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  設定
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ redirectUrl: "/" })}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  サインアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SignedIn>
        </div>
      </Container>

      {/* Keyboard Shortcuts Dialog (only if not controlled externally) */}
      {!onShortcutsOpenChange && (
        <KeyboardShortcutsDialog
          open={localShortcutsOpen}
          onOpenChange={setLocalShortcutsOpen}
        />
      )}
    </header>
  );
};

export default Header;
