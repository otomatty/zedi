import React, { useCallback, useState } from "react";
import { Link, useMatch } from "react-router-dom";
import { Menu, Home, FileText } from "lucide-react";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
  useIsMobile,
} from "@zedi/ui";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useTranslation } from "react-i18next";

/**
 * One entry in the navigation grid inside the header dropdown / sheet.
 * ヘッダーのナビグリッドに並ぶ 1 項目。
 */
interface NavEntry {
  path: string;
  icon: React.FC<{ className?: string }>;
  i18nKey: string;
  /** Treat only exact `path` as active. / 完全一致のみアクティブ扱いにする。 */
  exact?: boolean;
}

const NAV_ENTRIES: readonly NavEntry[] = [
  { path: "/home", icon: Home, i18nKey: "nav.home", exact: true },
  { path: "/notes", icon: FileText, i18nKey: "nav.notes" },
] as const;

const TILE_BASE_CLASS =
  "flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const TILE_ACTIVE_CLASS = "bg-accent text-accent-foreground";
const ICON_WRAP_CLASS = "bg-muted h-10 w-10 rounded-lg flex items-center justify-center";
const LABEL_CLASS = "text-xs font-medium";

/**
 * Reads `useMatch` for a nav entry. Hooks-per-item is safe because the list is
 * static (length/order never change between renders).
 *
 * ナビ項目ごとに `useMatch` を評価する。項目リストは静的なので、配列長・順序は
 * レンダー間で変わらず、Hook 呼び出し順は安定する。
 */
function useIsEntryActive(entry: NavEntry): boolean {
  const match = useMatch({ path: entry.path, end: entry.exact ?? false });
  return match != null;
}

interface NavTileProps {
  entry: NavEntry;
  label: string;
  active: boolean;
  onNavigate: () => void;
  as: "menuitem" | "link";
}

/**
 * Grid tile rendering a single nav entry. Renders as a `DropdownMenuItem`
 * on desktop (closes the menu on select) or a plain `<Link>` inside the
 * mobile sheet.
 *
 * 1 件のナビ項目を表すタイル。デスクトップは `DropdownMenuItem`（選択で閉じる）、
 * モバイルはシート内の通常の `<Link>` として描画する。
 */
const NavTile: React.FC<NavTileProps> = ({ entry, label, active, onNavigate, as }) => {
  const Icon = entry.icon;
  const className = cn(TILE_BASE_CLASS, active && TILE_ACTIVE_CLASS);

  if (as === "menuitem") {
    return (
      <DropdownMenuItem
        asChild
        onSelect={onNavigate}
        className={cn("cursor-pointer p-0 focus:bg-transparent")}
      >
        <Link to={entry.path} aria-label={label} className={className}>
          <span className={ICON_WRAP_CLASS}>
            <Icon className="text-muted-foreground h-5 w-5" />
          </span>
          <span className={LABEL_CLASS}>{label}</span>
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <Link to={entry.path} onClick={onNavigate} aria-label={label} className={className}>
      <span className={ICON_WRAP_CLASS}>
        <Icon className="text-muted-foreground h-5 w-5" />
      </span>
      <span className={LABEL_CLASS}>{label}</span>
    </Link>
  );
};

interface NavGridProps {
  onNavigate: () => void;
  as: "menuitem" | "link";
}

/**
 * The icon + label grid shared by the desktop dropdown and the mobile sheet.
 * デスクトップのドロップダウンとモバイルのシートで共通で使う、アイコン+ラベルのグリッド。
 */
const NavGrid: React.FC<NavGridProps> = ({ onNavigate, as }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {NAV_ENTRIES.map((entry) => (
        <NavGridEntry
          key={entry.path}
          entry={entry}
          label={t(entry.i18nKey)}
          onNavigate={onNavigate}
          as={as}
        />
      ))}
    </div>
  );
};

interface NavGridEntryProps {
  entry: NavEntry;
  label: string;
  onNavigate: () => void;
  as: "menuitem" | "link";
}

const NavGridEntry: React.FC<NavGridEntryProps> = ({ entry, label, onNavigate, as }) => {
  const active = useIsEntryActive(entry);
  return <NavTile entry={entry} label={label} active={active} onNavigate={onNavigate} as={as} />;
};

const NavTrigger = React.forwardRef<
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
      aria-label={t("nav.menu")}
      {...props}
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
});
NavTrigger.displayName = "NavTrigger";

const DesktopNavigationMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <NavTrigger />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-0">
        <NavGrid onNavigate={close} as="menuitem" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const MobileNavigationMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { t } = useTranslation();
  const sheetTitle = t("nav.menu");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <NavTrigger onClick={() => setOpen(true)} />
      <SheetContent side="right" className="w-3/4 max-w-sm p-4">
        <VisuallyHidden>
          <SheetTitle>{sheetTitle}</SheetTitle>
        </VisuallyHidden>
        <NavGrid onNavigate={close} as="link" />
      </SheetContent>
    </Sheet>
  );
};

/**
 * Consolidated header navigation. Presents Home / Notes (and future entries)
 * as an icon-plus-label tile grid inside a dropdown on desktop and a sheet on
 * mobile. Replaces the previous always-visible `PrimaryNav`.
 *
 * ヘッダーの機能ナビゲーションを集約したメニュー。Home / Notes（および将来追加分）を
 * 「アイコン+ラベル」のタイルとしてグリッド表示する。デスクトップはドロップダウン、
 * モバイルはシートで開く。常時表示だった従来の `PrimaryNav` を置き換える。
 */
export const NavigationMenu: React.FC = () => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileNavigationMenu /> : <DesktopNavigationMenu />;
};
