import { Home, FileText, Sparkles } from "lucide-react";
import { matchPath } from "react-router-dom";
import type React from "react";

/**
 * One entry in the primary navigation. The header dropdown and the mobile
 * bottom navigation both render the same list so the two surfaces stay in
 * sync. User-menu / account entries are intentionally excluded; they live on
 * the header avatar and the bottom nav "Me" tab respectively.
 *
 * プライマリナビゲーションの 1 項目。ヘッダーのドロップダウンとモバイルのボトムナビが
 * 同じリストを参照するため、表示項目が常に一致する。ユーザーメニュー・アカウント関連は
 * ここには含めず、引き続きヘッダーのアバターとボトムナビの Me タブに分離する。
 */
export interface PrimaryNavItem {
  /** Link target. 遷移先パス。*/
  path: string;
  /** Icon component rendered in the tile / tab. タイルやタブに描画するアイコン。*/
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** i18n key for the label. ラベルの i18n キー。*/
  i18nKey: string;
  /**
   * Additional pathname patterns that should mark this entry as the active
   * tab. When omitted, only an exact match against {@link path} activates it.
   *
   * この項目をアクティブ扱いにする追加のパスパターン。未指定時は {@link path} と
   * 完全一致した場合のみアクティブになる。
   */
  matchPaths?: readonly string[];
}

/**
 * Canonical primary navigation items shared by the header dropdown and the
 * mobile bottom navigation. Adding, removing, or reordering entries here
 * updates both surfaces at once.
 *
 * ヘッダーのドロップダウンとモバイルボトムナビで共有する、プライマリナビの正本。
 * 追加・削除・並び替えはこの配列だけを編集すれば両方のUIに反映される。
 */
export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  { path: "/home", icon: Home, i18nKey: "nav.home" },
  {
    path: "/notes",
    icon: FileText,
    i18nKey: "nav.notes",
    matchPaths: ["/notes", "/notes/discover"],
  },
  {
    path: "/ai",
    icon: Sparkles,
    i18nKey: "nav.ai",
    matchPaths: ["/ai", "/ai/:conversationId", "/ai/history"],
  },
] as const;

/**
 * Returns true when `pathname` should mark `item` as the active primary nav
 * entry. Uses {@link PrimaryNavItem.matchPaths} when provided; otherwise
 * falls back to an exact match against {@link PrimaryNavItem.path}.
 *
 * `pathname` が `item` をアクティブ扱いすべきかを返す。{@link PrimaryNavItem.matchPaths}
 * があればそのいずれかにマッチ、無ければ {@link PrimaryNavItem.path} との完全一致を使う。
 */
export function isPrimaryNavActive(item: PrimaryNavItem, pathname: string): boolean {
  const patterns = item.matchPaths ?? [item.path];
  return patterns.some((pattern) => matchPath({ path: pattern, end: true }, pathname) != null);
}
