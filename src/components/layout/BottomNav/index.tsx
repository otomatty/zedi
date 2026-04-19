import React, { useCallback, useState } from "react";
import { useMatch } from "react-router-dom";
import { Home, FileText, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, cn } from "@zedi/ui";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { SignedIn, SignedOut, useAuth, useUser } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSyncStatusDotColor } from "../Header/UnifiedMenuSyncStatus";
import { SignedInMenuContent, SignedOutMenuContent } from "./BottomNavMeContent";
import { BottomNavTab } from "./BottomNavTab";

/**
 * Mobile bottom navigation with four tabs (Home / Notes / AI / Me). The Me
 * tab opens a sheet that reuses the signed-in / signed-out menu content from
 * {@link UnifiedMenu}, keeping the two surfaces in sync.
 *
 * モバイル用のボトムナビゲーション（Home / Notes / AI / Me の 4 タブ）。
 * Me タブは {@link UnifiedMenu} と共通のメニュー内容を Sheet で表示するので、
 * デスクトップとモバイルのアカウントメニューが二重実装にならない。
 */
export const BottomNav: React.FC = () => {
  const { t } = useTranslation();
  const homeMatch = useMatch({ path: "/home", end: true });
  const notesMatch = useMatch({ path: "/notes" });
  const aiMatch = useMatch({ path: "/ai" });
  const aiDetailMatch = useMatch({ path: "/ai/:conversationId" });
  const aiHistoryMatch = useMatch({ path: "/ai/history" });
  const aiActive = aiMatch != null || aiDetailMatch != null || aiHistoryMatch != null;
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
        <BottomNavTab
          to="/home"
          icon={Home}
          label={t("nav.home", "Home")}
          active={homeMatch != null}
        />
        <BottomNavTab
          to="/notes"
          icon={FileText}
          label={t("nav.notes", "Notes")}
          active={notesMatch != null}
        />
        <BottomNavTab to="/ai" icon={Sparkles} label={t("nav.ai", "AI")} active={aiActive} />
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
        "text-muted-foreground hover:text-foreground flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
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
