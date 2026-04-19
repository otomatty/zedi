import React from "react";
import { NavLink } from "react-router-dom";
import { Home, FileText } from "lucide-react";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";

interface PrimaryNavItem {
  path: string;
  icon: React.FC<{ className?: string }>;
  i18nKey: string;
  exact?: boolean;
}

const NAV_ITEMS: readonly PrimaryNavItem[] = [
  { path: "/home", icon: Home, i18nKey: "nav.home", exact: true },
  { path: "/notes", icon: FileText, i18nKey: "nav.notes" },
] as const;

interface PrimaryNavProps {
  className?: string;
}

/**
 * Primary functional navigation rendered as visible buttons in the app header.
 * Separated from the user menu so that core app destinations (Home, Notes) are
 * one click away. Labels are hidden on small screens; icons stay visible.
 *
 * ヘッダー内に常時表示する主要な機能ナビゲーション。
 * ユーザーメニューから分離し、Home/Notes などの主要画面へワンクリックで移動できるようにする。
 * 小さい画面ではラベルを隠してアイコンのみ表示する。
 */
export const PrimaryNav: React.FC<PrimaryNavProps> = ({ className }) => {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("nav.primary", "Primary navigation")}
      className={cn("flex items-center gap-1", className)}
    >
      {NAV_ITEMS.map(({ path, icon: Icon, i18nKey, exact }) => {
        const label = t(i18nKey);
        return (
          <NavLink
            key={path}
            to={path}
            end={exact}
            aria-label={label}
            title={label}
            className={({ isActive }) =>
              cn(
                "focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none sm:px-3",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};
