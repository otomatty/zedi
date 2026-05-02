import React, { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetTitle, cn } from "@zedi/ui";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { SignedIn, SignedOut, useAuth, useUser } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSyncStatusDotColor } from "../Header/UnifiedMenuSyncStatus";
import { PRIMARY_NAV_ITEMS, isPrimaryNavActive } from "../navigationItems";
import { SignedInMenuContent, SignedOutMenuContent } from "./BottomNavMeContent";
import { BottomNavTab } from "./BottomNavTab";

/**
 * Mobile bottom navigation. Renders the shared {@link PRIMARY_NAV_ITEMS} as
 * tabs followed by a Me tab. The Me tab opens a sheet that reuses the
 * signed-in / signed-out menu content from {@link UnifiedMenu}, so the
 * account surfaces stay in sync; the primary tabs stay in sync with the
 * header dropdown because both read from the same config.
 *
 * モバイル用のボトムナビゲーション。共通の {@link PRIMARY_NAV_ITEMS} をタブとして描画し、
 * 末尾に Me タブを追加する。Me タブは {@link UnifiedMenu} と同じメニュー内容を Sheet で
 * 表示しアカウント UI の二重実装を避ける。プライマリタブはヘッダーのドロップダウンと
 * 同じ配列を参照するので表示項目が常に一致する。
 */
export const BottomNav: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [meOpen, setMeOpen] = useState(false);
  const closeMe = useCallback(() => setMeOpen(false), []);
  const sheetTitle = t("nav.account", "Account");

  return (
    <nav
      aria-label={t("nav.primary", "Primary navigation")}
      className={cn(
        "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed right-0 bottom-0 left-0 z-40 border-t backdrop-blur",
        "pb-[env(safe-area-inset-bottom)]",
      )}
      style={{ height: "calc(var(--app-bottom-nav-height, 3.5rem) + env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex h-[var(--app-bottom-nav-height,3.5rem)] max-w-md items-stretch">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <BottomNavTab
            key={item.path}
            to={item.path}
            icon={item.icon}
            label={t(item.i18nKey)}
            active={isPrimaryNavActive(item, pathname)}
          />
        ))}
        <li className="flex-1">
          <MeTab open={meOpen} onOpenChange={setMeOpen} />
        </li>
      </ul>

      <Sheet open={meOpen} onOpenChange={setMeOpen}>
        <SheetContent side="right" className="w-3/4 max-w-sm p-4">
          <VisuallyHidden>
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>{t("nav.account", "Account")}</SheetDescription>
          </VisuallyHidden>
          <div data-testid="bottom-nav-me-content">
            <SignedIn>
              <SignedInMenuContent onClose={closeMe} />
            </SignedIn>
            <SignedOut>
              <SignedOutMenuContent onClose={closeMe} />
            </SignedOut>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
};

interface MeTabProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MeTab: React.FC<MeTabProps> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { displayName, avatarUrl } = useProfile();
  const dotColor = useSyncStatusDotColor();

  return (
    <button
      type="button"
      aria-label={t("nav.account", "Account")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => onOpenChange(true)}
      className={cn(
        "text-muted-foreground hover:text-foreground flex h-full w-full flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
      )}
    >
      <span className="relative">
        {isSignedIn ? (
          <Avatar className="h-6 w-6">
            <AvatarImage
              src={avatarUrl || user?.imageUrl}
              alt={displayName || user?.fullName || "User"}
            />
            <AvatarFallback className="text-[10px]">
              {(displayName || user?.firstName)?.charAt(0) ?? "U"}
            </AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">
              {t("nav.account", "Account").charAt(0)}
            </AvatarFallback>
          </Avatar>
        )}
        {dotColor && (
          <span
            className={cn(
              "border-background absolute right-0 bottom-0 h-2 w-2 rounded-full border",
              dotColor,
            )}
          />
        )}
      </span>
      <span>{t("nav.account", "Account")}</span>
    </button>
  );
};

export default BottomNav;
