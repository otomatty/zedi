import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Home, FileText } from "lucide-react";
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
}

const NAV_ENTRIES: readonly NavEntry[] = [
  { path: "/home", icon: Home, i18nKey: "nav.home" },
  { path: "/notes", icon: FileText, i18nKey: "nav.notes" },
] as const;

const TILE_BASE_CLASS =
  "flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-muted data-[highlighted]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const ICON_WRAP_CLASS = "bg-muted h-10 w-10 rounded-lg flex items-center justify-center";
const LABEL_CLASS = "text-xs font-medium";

/**
 * 9-dot grid icon used as the navigation menu trigger. Rendered as an
 * inline SVG so spacing stays precise across viewports.
 *
 * ナビゲーションメニューのトリガーに使う 9 点グリッドアイコン。
 * ビューポートを跨いでも余白が崩れないよう、インライン SVG で描画する。
 */
const DotGridIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <circle cx="5" cy="5" r="1.75" />
    <circle cx="12" cy="5" r="1.75" />
    <circle cx="19" cy="5" r="1.75" />
    <circle cx="5" cy="12" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="19" cy="12" r="1.75" />
    <circle cx="5" cy="19" r="1.75" />
    <circle cx="12" cy="19" r="1.75" />
    <circle cx="19" cy="19" r="1.75" />
  </svg>
);

interface NavTileProps {
  entry: NavEntry;
  label: string;
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
const NavTile: React.FC<NavTileProps> = ({ entry, label, onNavigate, as }) => {
  const Icon = entry.icon;

  if (as === "menuitem") {
    return (
      <DropdownMenuItem
        asChild
        onSelect={onNavigate}
        className={cn("cursor-pointer p-0 focus:bg-transparent focus:text-inherit")}
      >
        <Link to={entry.path} className={TILE_BASE_CLASS}>
          <span className={ICON_WRAP_CLASS}>
            <Icon aria-hidden="true" className="text-muted-foreground h-5 w-5" />
          </span>
          <span className={LABEL_CLASS}>{label}</span>
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <Link to={entry.path} onClick={onNavigate} className={TILE_BASE_CLASS}>
      <span className={ICON_WRAP_CLASS}>
        <Icon aria-hidden="true" className="text-muted-foreground h-5 w-5" />
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
        <NavTile
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
      className="h-12 w-12"
      aria-label={t("nav.menu")}
      {...props}
    >
      <DotGridIcon className="h-6 w-6" />
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
