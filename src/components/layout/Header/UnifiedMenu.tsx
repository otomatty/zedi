import React, { useState, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Home,
  FileText,
  Settings,
  CreditCard,
  LogOut,
  User,
  Cloud,
  CloudOff,
  Loader2,
  Check,
  DatabaseZap,
} from "lucide-react";
import { Button } from "@zedi/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@zedi/ui";
import { Sheet, SheetContent, SheetTitle } from "@zedi/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@zedi/ui";
import { SignedIn, SignedOut, useAuth, useUser } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSyncStatus, useSync } from "@/hooks/usePageQueries";
import { useTranslation } from "react-i18next";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@zedi/ui";

const SM_BREAKPOINT = 640;

function useIsSmallScreen() {
  const [isSmall, setIsSmall] = useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth < SM_BREAKPOINT : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SM_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsSmall(window.innerWidth < SM_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    queueMicrotask(() => setIsSmall(window.innerWidth < SM_BREAKPOINT));
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isSmall;
}

// --- Sync status config ---

type SyncStatusKey = "idle" | "syncing" | "synced" | "error" | "db-resuming";

function useSyncStatusConfig() {
  const { t } = useTranslation();

  const configs: Record<
    SyncStatusKey,
    {
      icon: React.FC<{ className?: string }>;
      label: string;
      description: string;
      dotColor: string;
      iconClassName: string;
    }
  > = {
    idle: {
      icon: Cloud,
      label: t("common.syncIdleLabel"),
      description: t("common.syncIdleDescription"),
      dotColor: "bg-muted-foreground",
      iconClassName: "text-muted-foreground",
    },
    syncing: {
      icon: Loader2,
      label: t("common.syncSyncingLabel"),
      description: t("common.syncSyncingDescription"),
      dotColor: "bg-blue-500 animate-pulse",
      iconClassName: "text-blue-500 animate-spin",
    },
    synced: {
      icon: Check,
      label: t("common.syncSyncedLabel"),
      description: t("common.syncSyncedDescription"),
      dotColor: "bg-green-500",
      iconClassName: "text-green-500",
    },
    error: {
      icon: CloudOff,
      label: t("common.syncErrorLabel"),
      description: t("common.syncErrorDescription"),
      dotColor: "bg-destructive",
      iconClassName: "text-destructive",
    },
    "db-resuming": {
      icon: DatabaseZap,
      label: t("common.syncDbResumingLabel", "DB starting…"),
      description: t(
        "common.syncDbResumingDescription",
        "Database is waking up. Please wait a moment.",
      ),
      dotColor: "bg-amber-500 animate-pulse",
      iconClassName: "text-amber-500 animate-pulse",
    },
  };

  return configs;
}

// --- Sync status row inside menu ---

const SyncStatusRow: React.FC = () => {
  const { isSignedIn } = useAuth();
  const syncStatus = useSyncStatus();
  const { sync, isSyncing } = useSync();
  const configs = useSyncStatusConfig();

  if (!isSignedIn) return null;

  const config = configs[syncStatus];
  const Icon = config.icon;

  return (
    <>
      <hr className="border-border my-1" />
      <div className="px-2 py-1.5">
        <button
          type="button"
          onClick={sync}
          disabled={isSyncing || syncStatus === "syncing"}
          className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon className={cn("h-4 w-4 shrink-0", config.iconClassName)} />
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-xs font-medium">{config.label}</span>
            <span className="text-muted-foreground truncate text-[11px]">{config.description}</span>
          </div>
        </button>
      </div>
    </>
  );
};

// --- Shared menu content ---

interface MenuContentProps {
  onClose: () => void;
  layout?: "grid" | "list";
}

// --- Navigation items renderer ---

interface NavItem {
  icon: React.FC<{ className?: string }>;
  label: string;
  path: string;
}

const NavItems: React.FC<{
  items: NavItem[];
  layout: "grid" | "list";
  onNavigate: (path: string) => void;
}> = ({ items, layout, onNavigate }) => {
  if (layout === "list") {
    return (
      <div className="flex flex-col gap-1 p-2">
        {items.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => onNavigate(item.path)}
            className="hover:bg-muted flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors"
          >
            <item.icon className="text-muted-foreground h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {items.map((item) => (
        <button
          key={item.path}
          type="button"
          onClick={() => onNavigate(item.path)}
          className="hover:bg-muted flex flex-col items-center gap-2 rounded-lg p-3 transition-colors"
        >
          <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
            <item.icon className="text-muted-foreground h-5 w-5" />
          </div>
          <span className="text-xs font-medium">{item.label}</span>
        </button>
      ))}
    </div>
  );
};

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
      {/* User info */}
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

      {/* Navigation */}
      <NavItems items={navItems} layout={layout} onNavigate={handleNavigate} />

      {/* Sync status */}
      <SyncStatusRow />

      <hr className="border-border my-1" />

      {/* Sign out */}
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
      {/* Navigation */}
      <NavItems items={navItems} layout={layout} onNavigate={handleNavigate} />

      <hr className="border-border my-1" />

      {/* Sign in */}
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

// --- Trigger button ---

const AvatarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>((props, ref) => {
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const { displayName, avatarUrl } = useProfile();
  const syncStatus = useSyncStatus();
  const configs = useSyncStatusConfig();

  const dotColor = isSignedIn ? configs[syncStatus].dotColor : undefined;

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

// --- Desktop dropdown ---

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

// --- Mobile sheet ---

const MobileMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <SignedIn>
        <Sheet open={open} onOpenChange={setOpen}>
          <AvatarTrigger onClick={() => setOpen(true)} />
          <SheetContent side="right" className="w-3/4 p-4 sm:max-w-sm">
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
          <SheetContent side="right" className="w-3/4 p-4 sm:max-w-sm">
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

// --- Unified export ---

/**
 *
 */
export /**
 *
 */
const UnifiedMenu: React.FC = () => {
  /**
   *
   */
  const isSmall = useIsSmallScreen();
  return isSmall ? <MobileMenu /> : <DesktopMenu />;
};
