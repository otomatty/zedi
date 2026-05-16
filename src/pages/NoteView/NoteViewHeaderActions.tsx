import { Link } from "react-router-dom";
import { Settings, Users } from "lucide-react";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { Note, NoteAccessRole } from "@/types/note";

/**
 * Props for the note header actions.
 * ノートヘッダーアクションの Props。
 */
export interface NoteViewHeaderActionsProps {
  note: Note;
  /**
   * owner 相当（管理操作可能）か。owner のときは歯車を出して
   * `/notes/:id/settings` に遷移する。
   * Owner-equivalent: shows the gear icon linking to `/notes/:id/settings`.
   */
  canManageMembers: boolean;
  /**
   * このユーザーがノートを閲覧できるか。editor / viewer が共有設定を
   * read-only で確認するためのエントリポイント表示判定に使う。
   * Whether the current user can view the note. Drives the read-only
   * "View share settings" entry point for editor / viewer.
   */
  canView: boolean;
  /**
   * ノート上の現在ユーザーのロール。editor / viewer に対するリンク先
   * (`/settings/members` vs `/settings/visibility`) の分岐に使う。
   * The caller's role on the note. Determines which settings subroute the
   * read-only entry point links to.
   */
  userRole: NoteAccessRole;
}

/**
 * ノート詳細ページ上部の操作アイコン。ロールに応じて 1 個のリンクボタンを描画する。
 *
 * - owner: 歯車 (`Settings`) → `/notes/:id/settings`（フル編集）
 * - editor (canView=true): 共有閲覧 (`Users`) → `/notes/:id/settings/members`
 *   （read-only でメンバー / リンク / ドメイン / 公開設定を閲覧）
 * - viewer (canView=true): 共有閲覧 (`Users`) → `/notes/:id/settings/visibility`
 *   （viewer は visibility セクションのみ閲覧可）
 * - guest / canView=false: 非表示
 *
 * Issue #675 (#661 follow-up): editor / viewer にもアクセス透明性のための
 * read-only エントリを提供する。共有モーダル自体は #846 で廃止され、
 * settings 側がすでに read-only 表示を持っているため、本コンポーネントは
 * 純粋に動線（リンク 1 つ）に集中する。
 *
 * Top-right note actions. The legacy share modal was removed in #846; this
 * component just exposes a role-aware link into `/notes/:id/settings/*`,
 * where the read-only behavior is already enforced section by section.
 */
export function NoteViewHeaderActions({
  note,
  canManageMembers,
  canView,
  userRole,
}: NoteViewHeaderActionsProps) {
  const { t } = useTranslation();

  if (canManageMembers) {
    return (
      <Button
        asChild
        variant="ghost"
        size="icon"
        aria-label={t("notes.openSettings")}
        title={t("notes.openSettings")}
      >
        <Link to={`/notes/${note.id}/settings`}>
          <Settings className="h-4 w-4" aria-hidden />
        </Link>
      </Button>
    );
  }

  // editor / viewer 向け read-only エントリ。canView=false の guest / none は
  // 何も出さない。editor は members、viewer は visibility をランディングに
  // 使う（サイドナビで他セクションへ移動可）。
  // Read-only entry for editor / viewer. Guests with no view access see
  // nothing. Editors land on members (richest read-only view); viewers land
  // on visibility (the only section they can see).
  if (!canView) return null;
  if (userRole !== "editor" && userRole !== "viewer") return null;

  const target =
    userRole === "editor"
      ? `/notes/${note.id}/settings/members`
      : `/notes/${note.id}/settings/visibility`;

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      aria-label={t("notes.openShareSettingsReadOnly")}
      title={t("notes.openShareSettingsReadOnly")}
    >
      <Link to={target}>
        <Users className="h-4 w-4" aria-hidden />
      </Link>
    </Button>
  );
}
