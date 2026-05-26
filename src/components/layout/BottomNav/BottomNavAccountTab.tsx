import React from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage, cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { SignedIn, SignedOut, useAuth, useUser } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSyncStatusDotColor } from "../Header/UnifiedMenuSyncStatus";

interface BottomNavAccountTabProps {
  active: boolean;
}

/**
 * Bottom-nav "Me" tab linking to `/account`. Mirrors {@link BottomNavTab}
 * structure but renders the user avatar (and sync dot) instead of a Lucide icon.
 *
 * ボトムナビの「Me」タブ。`/account` へ遷移し、Lucide アイコンの代わりに
 * アバター（と同期ドット）を表示する。
 */
export const BottomNavAccountTab: React.FC<BottomNavAccountTabProps> = ({ active }) => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { displayName, avatarUrl } = useProfile();
  const dotColor = useSyncStatusDotColor();
  const label = t("nav.account", "Account");

  return (
    <li className="flex-1">
      <Link
        to="/account"
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="relative">
          <SignedIn>
            <Avatar className="h-6 w-6">
              <AvatarImage
                src={avatarUrl || user?.imageUrl}
                alt={displayName || user?.fullName || "User"}
              />
              <AvatarFallback className="text-[10px]">
                {(displayName || user?.firstName)?.charAt(0) ?? "U"}
              </AvatarFallback>
            </Avatar>
          </SignedIn>
          <SignedOut>
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">{label.charAt(0)}</AvatarFallback>
            </Avatar>
          </SignedOut>
          {isSignedIn && dotColor && (
            <span
              className={cn(
                "border-background absolute right-0 bottom-0 h-2 w-2 rounded-full border",
                dotColor,
              )}
            />
          )}
        </span>
        <span>{label}</span>
      </Link>
    </li>
  );
};
