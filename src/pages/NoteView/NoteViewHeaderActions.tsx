import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { Note, NoteAccessRole } from "@/types/note";

/**
 * Props for the simplified note header actions.
 * 簡素化されたノートヘッダーアクションの Props。
 */
export interface NoteViewHeaderActionsProps {
  note: Note;
  /** owner 判定（管理可能か）。owner のときだけ歯車を出す。 */
  canManageMembers: boolean;
  /**
   * ロール情報。現状は描画分岐に直接使わないが、将来 editor 向け read-only
   * 設定リンクを出したくなったときの拡張点として props に残す（呼び出し側を
   * 二度変えなくて済むようにするための予防的シグネチャ維持）。
   * Kept on the props so a future read-only entry point for editors does not
   * require touching every caller.
   */
  userRole: NoteAccessRole;
}

/**
 * ノート詳細ページ上部の操作アイコン。owner のみ「設定ページへ」遷移する
 * 歯車アイコンリンクを表示する。共有モーダルは廃止し、共有 URL コピーは
 * `NoteShareUrlCopyButton`（タイトル横、public/unlisted のとき）に分離した。
 *
 * Top-right note actions. Owners get a single gear icon linking to
 * `/notes/:id/settings`. The legacy share modal was retired; the quick-copy
 * URL action now lives next to the title as `NoteShareUrlCopyButton`.
 */
export function NoteViewHeaderActions({ note, canManageMembers }: NoteViewHeaderActionsProps) {
  const { t } = useTranslation();

  if (!canManageMembers) return null;

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
