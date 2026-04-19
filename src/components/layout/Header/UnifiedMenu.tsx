import React, { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Settings, CreditCard, Receipt, LogOut, LogIn, User } from "lucide-react";
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

interface AccountActionItem {
  icon: React.FC<{ className?: string }>;
  label: string;
  path: string;
  /** Show only when the user is signed in. / サインイン時のみ表示する。 */
  signedInOnly?: boolean;
}

function useAccountActionItems(): AccountActionItem[] {
  const { t } = useTranslation();
  return [
    { icon: Settings, label: t("nav.settings"), path: "/settings" },
    { icon: CreditCard, label: t("nav.plan"), path: "/pricing" },
    {
      icon: Receipt,
      label: t("nav.subscription", "Subscription"),
      path: "/subscription",
      signedInOnly: true,
    },
  ];
}

interface AccountActionsListProps {
  items: AccountActionItem[];
  isSignedIn: boolean;
  onNavigate: (path: string) => void;
}

/**
 * Vertical list of account-related actions inside the user menu.
 * ユーザーメニュー内のアカウント関連アクションを縦並びで表示する。
 */
const AccountActionsList: React.FC<AccountActionsListProps> = ({
  items,
  isSignedIn,
  onNavigate,
}) => (
  <div className="flex flex-col gap-1 p-2">
    {items
      .filter((item) => !item.signedInOnly || isSignedIn)
      .map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => onNavigate(item.path)}
            className="hover:bg-muted flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors"
          >
            <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="font-medium">{item.label}</span>
          </button>
        );
      })}
  </div>
);

interface MenuContentProps {
  onClose: () => void;
}

const SignedInMenuContent: React.FC<MenuContentProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { displayName, avatarUrl } = useProfile();
  const { t } = useTranslation();
  const items = useAccountActionItems();

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  const handleSignOut = useCallback(() => {
    void signOut();
    onClose();
  }, [signOut, onClose]);

  return (
    <>
      <div className="flex items-center gap-3 p-3">
        <Avatar className="h-10 w-10 shrink-0">
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
      <AccountActionsList items={items} isSignedIn onNavigate={handleNavigate} />
      <SyncStatusRow />

      <hr className="border-border my-1" />
      <div className="p-2">
        <button
          type="button"
          onClick={handleSignOut}
          className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {t("nav.signOut")}
        </button>
      </div>
    </>
  );
};

const SignedOutMenuContent: React.FC<MenuContentProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const items = useAccountActionItems();

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  return (
    <>
      <AccountActionsList items={items} isSignedIn={false} onNavigate={handleNavigate} />
      <hr className="border-border my-1" />
      <div className="p-2">
        <Link to="/sign-in" onClick={onClose}>
          <Button className="w-full gap-2">
            <LogIn className="h-4 w-4" />
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
  const { t } = useTranslation();
  const dotColor = useSyncStatusDotColor();

  return (
    <Button
      ref={ref}
      variant="ghost"
      className="relative h-9 w-9 rounded-full"
      aria-label={t("nav.account", "Account")}
      {...props}
    >
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
>((props, ref) => {
  const { t } = useTranslation();
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      aria-label={t("nav.account", "Account")}
      {...props}
    >
      <User className="h-5 w-5" />
    </Button>
  );
});
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
          <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-0">
            <SignedInMenuContent onClose={close} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedIn>
      <SignedOut>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <GuestTrigger />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-0">
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
  const { t } = useTranslation();
  const sheetTitle = t("nav.account", "Account");

  return (
    <>
      <SignedIn>
        <Sheet open={open} onOpenChange={setOpen}>
          <AvatarTrigger onClick={() => setOpen(true)} />
          <SheetContent side="right" className="w-3/4 max-w-sm p-4">
            <VisuallyHidden>
              <SheetTitle>{sheetTitle}</SheetTitle>
            </VisuallyHidden>
            <SignedInMenuContent onClose={close} />
          </SheetContent>
        </Sheet>
      </SignedIn>
      <SignedOut>
        <Sheet open={open} onOpenChange={setOpen}>
          <GuestTrigger onClick={() => setOpen(true)} />
          <SheetContent side="right" className="w-3/4 max-w-sm p-4">
            <VisuallyHidden>
              <SheetTitle>{sheetTitle}</SheetTitle>
            </VisuallyHidden>
            <SignedOutMenuContent onClose={close} />
          </SheetContent>
        </Sheet>
      </SignedOut>
    </>
  );
};

/**
 * User-only menu shown in the right-hand side of the header.
 * Contains account actions (settings, plan, subscription), sync status and
 * sign-in/out. Functional navigation lives in {@link PrimaryNav} now.
 *
 * ヘッダー右側のユーザー専用メニュー。アカウント設定・プラン・サブスクリプション・
 * 同期ステータス・サインイン/アウトのみを扱う。機能ナビゲーションは {@link PrimaryNav} に分離した。
 */
export const UnifiedMenu: React.FC = () => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileMenu /> : <DesktopMenu />;
};
