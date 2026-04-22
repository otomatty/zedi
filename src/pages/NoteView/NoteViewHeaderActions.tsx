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
import type { Note } from "@/types/note";
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
}

/**
 * Renders the note detail page top actions as a single dropdown button.
 * Exposes Share (opens modal) and Settings (navigates) entries so the header
 * stays compact; add-page is handled by the FAB and is not included here.
 *
 * /notes/[id] 上部アクションを 1 つのドロップダウンにまとめる。
 * 共有（モーダル起動）と設定（遷移）を提供し、ページ追加は FAB 側に委譲する。
 */
export function NoteViewHeaderActions({
  note,
  canManageMembers,
  isSignedIn,
  canView,
}: NoteViewHeaderActionsProps) {
  const { t } = useTranslation();
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { data: members = [] } = useNoteMembers(note.id, canManageMembers);
  const acceptedCount = members.filter((m) => m.status === "accepted").length;

  if (!canManageMembers) {
    if (!isSignedIn && canView) {
      return <span className="text-muted-foreground text-sm">{t("notes.loginToPost")}</span>;
    }
    return null;
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
      <NoteShareModal open={isShareOpen} onOpenChange={setIsShareOpen} note={note} />
    </div>
  );
}
