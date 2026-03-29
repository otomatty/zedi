import React, { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Home, FileText, Settings, CreditCard, LogOut, User } from "lucide-react";
import { Button, useIsMobile } from "@zedi/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@zedi/ui";
import { Sheet, SheetContent, SheetTitle } from "@zedi/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@zedi/ui";
import { SignedIn, SignedOut, useAuth, useUser } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useTranslation } from "react-i18next";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@zedi/ui";
import { SyncStatusRow, useSyncStatusDotColor } from "./UnifiedMenuSyncStatus";
import { NavItems } from "./UnifiedMenuNavItems";

interface MenuContentProps {
  onClose: () => void;
  layout?: "grid" | "list";
}

const SignedInMenuContent: React.FC<MenuContentProps> = ({ onClose, layout = "grid" }) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { displayName, avatarUrl } = useProfile();
  const { t } = useTranslation();

  const navItems = [
    { icon: Home, label: t("nav.home"), path: "/home" },
    { icon: FileText, label: t("nav.notes"), path: "/notes" },
    { icon: Settings, label: t("nav.settings"), path: "/settings" },
    { icon: CreditCard, label: t("nav.plan"), path: "/pricing" },
  ];

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  return (
    <>
      <div className="flex items-center gap-3 p-2">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage
            src={avatarUrl || user?.imageUrl}
            alt={displayName || user?.fullName || "User"}
          />
          <AvatarFallback>{(displayName || user?.firstName)?.charAt(0) ?? "U"}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col space-y-0.5 leading-none">
          {(displayName || user?.fullName) && (
            <p className="truncate text-sm font-medium">{displayName || user?.fullName}</p>
          )}
          {user?.primaryEmailAddress && (
            <p className="text-muted-foreground truncate text-xs">
              {user.primaryEmailAddress.emailAddress}
            </p>
          )}
        </div>
      </div>

      <hr className="border-border my-1" />
      <NavItems items={navItems} layout={layout} onNavigate={handleNavigate} />
      <SyncStatusRow />

      <hr className="border-border my-1" />
      <div className="p-2">
        <button
          type="button"
          onClick={() => {
            signOut();
            onClose();
          }}
          className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {t("nav.signOut")}
        </button>
      </div>
    </>
  );
};

const SignedOutMenuContent: React.FC<MenuContentProps> = ({ onClose, layout = "grid" }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const navItems = [
    { icon: Home, label: t("nav.home"), path: "/home" },
    { icon: FileText, label: t("nav.notes"), path: "/notes" },
    { icon: Settings, label: t("nav.settings"), path: "/settings" },
    { icon: CreditCard, label: t("nav.plan"), path: "/pricing" },
  ];

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  return (
    <>
      <NavItems items={navItems} layout={layout} onNavigate={handleNavigate} />
      <hr className="border-border my-1" />
      <div className="p-2">
        <Link to="/sign-in" onClick={onClose}>
          <Button variant="outline" className="w-full">
            {t("nav.signIn")}
          </Button>
        </Link>
      </div>
    </>
  );
};

const AvatarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>((props, ref) => {
  const { user } = useUser();
  const { displayName, avatarUrl } = useProfile();
  const dotColor = useSyncStatusDotColor();

  return (
    <Button ref={ref} variant="ghost" className="relative h-9 w-9 rounded-full" {...props}>
      <Avatar className="h-9 w-9">
        <AvatarImage
          src={avatarUrl || user?.imageUrl}
          alt={displayName || user?.fullName || "User"}
        />
        <AvatarFallback>{(displayName || user?.firstName)?.charAt(0) ?? "U"}</AvatarFallback>
      </Avatar>
      {dotColor && (
        <span
          className={cn(
            "border-background absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2",
            dotColor,
          )}
        />
      )}
    </Button>
  );
});
AvatarTrigger.displayName = "AvatarTrigger";

const GuestTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>((props, ref) => (
  <Button ref={ref} variant="ghost" size="icon" className="h-9 w-9" {...props}>
    <User className="h-5 w-5" />
    <span className="sr-only">メニュー</span>
  </Button>
));
GuestTrigger.displayName = "GuestTrigger";

const DesktopMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <SignedIn>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <AvatarTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-0">
            <SignedInMenuContent onClose={close} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedIn>
      <SignedOut>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <GuestTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-0">
            <SignedOutMenuContent onClose={close} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedOut>
    </>
  );
};

const MobileMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <SignedIn>
        <Sheet open={open} onOpenChange={setOpen}>
          <AvatarTrigger onClick={() => setOpen(true)} />
          <SheetContent side="right" className="w-3/4 max-w-sm p-4">
            <VisuallyHidden>
              <SheetTitle>メニュー</SheetTitle>
            </VisuallyHidden>
            <SignedInMenuContent onClose={close} layout="list" />
          </SheetContent>
        </Sheet>
      </SignedIn>
      <SignedOut>
        <Sheet open={open} onOpenChange={setOpen}>
          <GuestTrigger onClick={() => setOpen(true)} />
          <SheetContent side="right" className="w-3/4 max-w-sm p-4">
            <VisuallyHidden>
              <SheetTitle>メニュー</SheetTitle>
            </VisuallyHidden>
            <SignedOutMenuContent onClose={close} layout="list" />
          </SheetContent>
        </Sheet>
      </SignedOut>
    </>
  );
};

/**
 * User menu: dropdown on `md+`, sheet on smaller viewports (same breakpoint as the app sidebar).
 * ユーザーメニュー: `md` 以上はドロップダウン、未満はシート（アプリサイドバーと同じ閾値）。
 */
export const UnifiedMenu: React.FC = () => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileMenu /> : <DesktopMenu />;
};
