import React from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { PRIMARY_NAV_ITEMS, isPrimaryNavActive } from "../navigationItems";
import { BottomNavAccountTab } from "./BottomNavAccountTab";
import { BottomNavTab } from "./BottomNavTab";

/**
 * Mobile bottom navigation. Renders the shared {@link PRIMARY_NAV_ITEMS} as
 * tabs followed by a Me tab that links to `/account`. The account page reuses
 * menu content from {@link UnifiedMenu}; primary tabs stay in sync with the
 * header dropdown because both read from the same config.
 *
 * モバイル用のボトムナビゲーション。共通の {@link PRIMARY_NAV_ITEMS} をタブとして描画し、
 * 末尾の Me タブは `/account` へ遷移する。アカウント画面は {@link UnifiedMenu} と同じ
 * メニュー内容を表示する。プライマリタブはヘッダーのドロップダウンと同じ配列を参照する。
 */
export const BottomNav: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const accountActive = pathname === "/account";

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
        <BottomNavAccountTab active={accountActive} />
      </ul>
    </nav>
  );
};

export default BottomNav;
