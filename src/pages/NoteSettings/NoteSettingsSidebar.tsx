import React from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@zedi/ui";
import { AtSign, Globe, Link2, Settings as SettingsIcon, Trash2, UsersRound } from "lucide-react";

/**
 * 設定画面サイドナビの 1 項目。アイコン / ラベル i18n キー / サブルートパスを持つ。
 *
 * One sidebar entry — icon, label i18n key, and the sub-route path under
 * `/notes/:noteId/settings/`.
 */
export interface NoteSettingsNavItem {
  /** サブパス。`/notes/:noteId/settings/<key>` の `<key>` 部分。 */
  key: "general" | "visibility" | "members" | "links" | "domains" | "danger";
  /** i18n キー（`notes.settingsNav.<key>` ベース）。 */
  labelI18nKey: string;
  /** 行頭アイコン（lucide-react）。 */
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** 危険操作セクションを赤系で見せるためのフラグ。 */
  variant?: "danger";
}

/**
 * 描画する項目の順序。`visibleFor` に列挙したロールにのみ表示される。
 *
 * - owner: 全項目
 * - editor: visibility / members / links / domains（read-only セクションを閲覧）
 * - viewer: visibility のみ（公開設定を read-only で見られる）
 *
 * Items rendered in the sidebar (top → bottom). `visibleFor` lists the roles
 * that should see each entry. Sections themselves still enforce read-only.
 */
type SidebarRole = "owner" | "editor" | "viewer";
type NavItemSpec = NoteSettingsNavItem & { visibleFor: ReadonlyArray<SidebarRole> };

const NAV_ITEMS: NavItemSpec[] = [
  {
    key: "general",
    labelI18nKey: "notes.settingsNav.general",
    Icon: SettingsIcon,
    visibleFor: ["owner"],
  },
  {
    key: "visibility",
    labelI18nKey: "notes.settingsNav.visibility",
    Icon: Globe,
    visibleFor: ["owner", "editor", "viewer"],
  },
  {
    key: "members",
    labelI18nKey: "notes.settingsNav.members",
    Icon: UsersRound,
    visibleFor: ["owner", "editor"],
  },
  {
    key: "links",
    labelI18nKey: "notes.settingsNav.links",
    Icon: Link2,
    visibleFor: ["owner", "editor"],
  },
  {
    key: "domains",
    labelI18nKey: "notes.settingsNav.domains",
    Icon: AtSign,
    visibleFor: ["owner", "editor"],
  },
  {
    key: "danger",
    labelI18nKey: "notes.settingsNav.danger",
    Icon: Trash2,
    variant: "danger",
    visibleFor: ["owner"],
  },
];

/**
 * `NoteSettingsSidebar` の Props。レイアウト側から noteId と現在ロールを渡す。
 *
 * `sidebarRole` は `NoteSettingsContext.role` から導出した値で、サイドバーの
 * 表示制御だけに使う簡略化済みロール（owner/editor/viewer のいずれか）。
 * `guest` / `none` のときはレイアウトが描画自体を抑止する想定。
 */
export interface NoteSettingsSidebarProps {
  noteId: string;
  /** 現在ユーザーの簡略化済みロール。表示項目の絞り込みに使う。 */
  sidebarRole: SidebarRole;
}

/**
 * 設定画面の左サイドナビ（デスクトップ）/ 上部横スクロールタブ（モバイル）。
 * `NavLink` を使い、現在のサブルートに `aria-current=page` を付ける。
 *
 * Sidebar for `/notes/:noteId/settings/*`. Desktop renders a vertical nav;
 * narrow viewports collapse to a horizontally-scrollable tab strip. The
 * active subroute is marked with `aria-current="page"` so screen readers can
 * announce the current section.
 */
export const NoteSettingsSidebar: React.FC<NoteSettingsSidebarProps> = ({
  noteId,
  sidebarRole,
}) => {
  const { t } = useTranslation();
  const visible = NAV_ITEMS.filter((item) => item.visibleFor.includes(sidebarRole));

  return (
    <nav
      aria-label={t("notes.settingsNav.ariaLabel")}
      className="-mx-2 flex gap-1 overflow-x-auto px-2 py-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:py-0"
    >
      {visible.map(({ key, labelI18nKey, Icon, variant }) => (
        <NavLink
          key={key}
          to={`/notes/${noteId}/settings/${key}`}
          end
          className={({ isActive }) =>
            cn(
              "hover:bg-muted focus-visible:ring-ring inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
              isActive
                ? variant === "danger"
                  ? "bg-destructive/10 text-destructive font-medium"
                  : "bg-accent text-foreground font-medium"
                : variant === "danger"
                  ? "text-destructive/80 hover:text-destructive"
                  : "text-muted-foreground",
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="whitespace-nowrap">{t(labelI18nKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default NoteSettingsSidebar;
