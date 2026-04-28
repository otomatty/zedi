import { useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Settings, Share2 } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useNoteMembers } from "@/hooks/useNoteQueries";
import type { Note, NoteAccessRole } from "@/types/note";
import { NoteShareModal } from "./ShareModal/NoteShareModal";

/**
 * Props for the consolidated header actions dropdown.
 * 統合ヘッダーアクション（ドロップダウン）の Props。
 */
export interface NoteViewHeaderActionsProps {
  note: Note;
  canManageMembers: boolean;
  isSignedIn: boolean;
  canView: boolean;
  /**
   * 共有モーダルのタブ可視性 / read-only 制御に使う現在ユーザーのロール。
   * Current user's role on this note. Used to gate which share-modal tabs are
   * visible and which are rendered as read-only for editor / viewer.
   */
  userRole: NoteAccessRole;
}

/**
 * Renders the note detail page top actions.
 *
 * - Owner: ドロップダウン（共有 + 設定）+ 招待済みメンバー数バッジ。
 * - Editor / Viewer (signed-in, canView): 共有ボタンのみを表示する。共有モーダルは
 *   `userRole` に応じて owner 向け編集 UI / editor 向け read-only / viewer 向け
 *   公開設定のみ、と出し分ける。
 * - Guest (canView だが未ログイン): 「ログインすると投稿できます」ヒント。
 *
 * /notes/[id] 上部アクション。オーナーは共有 + 設定のドロップダウンを、
 * editor / viewer はサインインしていれば共有ボタンを表示する。共有モーダル
 * 側で `userRole` を解釈し閲覧可能タブ・read-only モードを切り替える。
 */
export function NoteViewHeaderActions({
  note,
  canManageMembers,
  isSignedIn,
  canView,
  userRole,
}: NoteViewHeaderActionsProps) {
  const { t } = useTranslation();
  const [isShareOpen, setIsShareOpen] = useState(false);

  // 招待済みメンバー数バッジは owner のみ取得・表示する。editor もメンバー一覧を
  // 閲覧できるが、ヘッダー上のバッジ価値は管理者向けのため owner 限定のままにする。
  // Only owners fetch + display the accepted-member count badge. Editors can
  // still browse the list inside the modal, but the header badge stays
  // owner-only since it is an at-a-glance signal for the manager.
  const { data: members = [] } = useNoteMembers(note.id, canManageMembers);
  const acceptedCount = members.filter((m) => m.status === "accepted").length;

  if (!canView) return null;

  if (!isSignedIn) {
    return <span className="text-muted-foreground text-sm">{t("notes.loginToPost")}</span>;
  }

  // editor / viewer は共有ボタン単体を出す（設定ページは owner 限定）。
  // Editors / viewers see a single share button — the settings page link stays
  // owner-only.
  if (!canManageMembers) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsShareOpen(true)}
          aria-label={t("notes.shareAria")}
        >
          <Share2 className="mr-2 h-4 w-4" aria-hidden />
          {t("notes.share")}
        </Button>
        <NoteShareModal
          open={isShareOpen}
          onOpenChange={setIsShareOpen}
          note={note}
          userRole={userRole}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={t("notes.openActions")}
            className="relative"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
            {acceptedCount > 0 ? (
              <Badge
                variant="secondary"
                className="ml-2 h-5 min-w-5 px-1.5 text-xs"
                aria-label={t("notes.shareMemberCountAria", { count: acceptedCount })}
              >
                {acceptedCount}
              </Badge>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuLabel>{t("notes.headerActionsLabel")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsShareOpen(true)}>
            <Share2 className="mr-2 h-4 w-4" aria-hidden />
            <span>{t("notes.share")}</span>
            {acceptedCount > 0 ? (
              <Badge
                variant="secondary"
                className="ml-auto h-5 min-w-5 px-1.5 text-xs"
                aria-label={t("notes.shareMemberCountAria", { count: acceptedCount })}
              >
                {acceptedCount}
              </Badge>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`/notes/${note.id}/settings`} className="flex w-full items-center">
              <Settings className="mr-2 h-4 w-4" aria-hidden />
              <span>{t("notes.settings")}</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NoteShareModal
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        note={note}
        userRole={userRole}
      />
    </div>
  );
}
