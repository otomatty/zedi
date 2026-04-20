import { Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button } from "@zedi/ui";
import { useNoteMembers } from "@/hooks/useNoteQueries";
import type { Note } from "@/types/note";
import { NoteShareModal } from "./NoteShareModal";

/**
 * 共有ボタンの Props。
 * Props for the share button.
 */
export interface ShareButtonProps {
  note: Note;
  /**
   * メンバー一覧を取得できる権限があるか（owner のみ true）。
   * Whether the viewer has permission to load the member list (owner only).
   */
  canManageMembers: boolean;
}

/**
 * ノート共有ボタン。参加メンバー数（accepted のみ）をバッジで併記する。
 * Share button in the note header. Renders the accepted-member count as a
 * badge so owners can see at a glance how many people currently collaborate.
 */
export function ShareButton({ note, canManageMembers }: ShareButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data: members = [] } = useNoteMembers(note.id, canManageMembers);
  const acceptedCount = members.filter((m) => m.status === "accepted").length;

  // 参加人数が 1 人以上のときはアクセシブルネームにも件数を含める。
  // When at least one member has joined, include the count in the button's
  // accessible name so screen readers announce the badge text (aria-label on
  // the button otherwise shadows the badge contents).
  const buttonAriaLabel =
    acceptedCount > 0
      ? `${t("notes.shareAria")} — ${t("notes.shareMemberCountAria", { count: acceptedCount })}`
      : t("notes.shareAria");

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={buttonAriaLabel}
      >
        <Share2 className="mr-2 h-4 w-4" aria-hidden />
        {t("notes.share")}
        {acceptedCount > 0 ? (
          <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1.5 text-xs" aria-hidden>
            {acceptedCount}
          </Badge>
        ) : null}
      </Button>
      <NoteShareModal open={open} onOpenChange={setOpen} note={note} />
    </>
  );
}
