import React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@zedi/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useAuth, useUser } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSyncStatusDotColor } from "../Header/UnifiedMenuSyncStatus";
import { PRIMARY_NAV_ITEMS, isPrimaryNavActive } from "../navigationItems";
import { BottomNavTab } from "./BottomNavTab";

/** Exact pathname for the Account tab. The tab has no nested routes, so a
 *  direct equality check is enough — matchPath would just compile a regex
 *  to validate the same single literal.
 *  アカウントタブのパス。サブルートを持たないので完全一致で判定する
 *  （matchPath だと同一リテラルの正規表現コンパイルが走るだけになる）。 */
const ACCOUNT_TAB_PATH = "/account";

/**
 * Mobile bottom navigation. Renders the shared {@link PRIMARY_NAV_ITEMS} as
 * tabs followed by an Account tab. The Account tab navigates to
 * `/account` so the bottom nav stays consistent with the other tabs
 * (history, back button, deep-linking) instead of opening a side Sheet.
 *
 * モバイル用のボトムナビゲーション。共通の {@link PRIMARY_NAV_ITEMS} をタブとして描画し、
 * 末尾にアカウントタブを追加する。アカウントタブは Sheet を開かず `/account` に遷移する
 * ため、他のタブと同じくページ遷移として履歴・戻る・ディープリンクが効く。
 */
export const BottomNav: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const accountActive = pathname === ACCOUNT_TAB_PATH;

  return (
    <nav
      aria-label={t("nav.primary", "Primary navigation")}
      className={cn(
        "border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed right-0 bottom-0 left-0 z-40 border-t backdrop-blur",
        "pb-[env(safe-area-inset-bottom)]",
      )}
      style={{ height: "calc(var(--app-bottom-nav-height, 4.5rem) + env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex h-[var(--app-bottom-nav-height,4.5rem)] max-w-md items-stretch">
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
          <AccountTab active={accountActive} />
        </li>
      </ul>
    </nav>
  );
};

interface AccountTabProps {
  active: boolean;
}

/**
 * Account tab in the mobile bottom nav. Renders the user's avatar (or a
 * generic fallback for guests) inside a `<Link>` to `/account` so the tab
 * behaves like the other primary tabs — pressing it navigates with full
 * history support, instead of opening a Sheet that bypasses the back stack.
 *
 * モバイルボトムナビのアカウントタブ。ユーザーのアバター（未ログインは汎用
 * フォールバック）を `<Link>` で包み `/account` に遷移する。他のプライマリ
 * タブと同様にページ遷移として履歴に積まれるため、戻るボタンが効く。
 */
const AccountTab: React.FC<AccountTabProps> = ({ active }) => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { displayName, avatarUrl } = useProfile();
  const dotColor = useSyncStatusDotColor();
  const label = t("nav.account", "Account");

  return (
    <Link
      to="/account"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
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
            <AvatarFallback className="text-[10px]">{label.charAt(0)}</AvatarFallback>
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
      <span>{label}</span>
    </Link>
  );
};

export default BottomNav;
