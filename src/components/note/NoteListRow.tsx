import React from "react";
import { Link } from "react-router-dom";
import { FileText, NotebookText, Pin, PinOff, Users } from "lucide-react";
import type { NoteSummary } from "@/types/note";
import type { NoteAccessRole } from "@/types/note";
import { cn } from "@zedi/ui";
import { NoteVisibilityBadge } from "./NoteVisibilityBadge";
import { Badge } from "@zedi/ui";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { formatTimeAgo } from "@/lib/dateUtils";
import { resolveNoteDisplayTitle } from "@/lib/noteListSections";

const ROLE_I18N_KEYS: Record<NoteAccessRole, string> = {
  owner: "common.note.owner",
  editor: "common.note.editor",
  viewer: "common.note.viewer",
  guest: "common.note.guest",
  none: "common.note.roleUnknown",
};

const ROLE_ACCENT_CLASS: Record<NoteAccessRole, string> = {
  owner: "bg-primary",
  editor: "bg-blue-500",
  viewer: "bg-muted-foreground/50",
  guest: "bg-muted-foreground/40",
  none: "bg-border",
};

export type NoteListRowVariant = "compact" | "card";

interface NoteListRowContentProps {
  note: NoteSummary;
  variant: NoteListRowVariant;
  isDefault: boolean;
  isActive?: boolean;
  isPinned?: boolean;
}

/**
 * Shared metadata layout for note list rows.
 * ノート一覧行の共通メタデータレイアウト。
 */
export const NoteListRowContent: React.FC<NoteListRowContentProps> = ({
  note,
  variant,
  isDefault,
  isActive,
  isPinned,
}) => {
  const { t } = useTranslation();
  const title = resolveNoteDisplayTitle(note.title, t("notes.untitledNote"));
  const updatedLabel = formatTimeAgo(note.updatedAt);

  return (
    <>
      <span
        className={cn("w-1 shrink-0 self-stretch rounded-full", ROLE_ACCENT_CLASS[note.role])}
        aria-hidden
      />
      <span
        className={cn(
          "bg-muted/60 text-muted-foreground flex shrink-0 items-center justify-center rounded-md",
          variant === "card" ? "h-10 w-10" : "h-9 w-9",
        )}
      >
        <NotebookText className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "truncate",
              variant === "card" ? "text-base font-medium" : "text-sm font-medium",
              isActive ? "text-foreground" : "text-foreground",
            )}
          >
            {title}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {isPinned && <Pin className="text-muted-foreground h-3.5 w-3.5" aria-hidden />}
            {note.isOfficial && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {t("notes.officialBadge")}
              </Badge>
            )}
            <NoteVisibilityBadge visibility={note.visibility} />
          </span>
        </span>
        <span className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span>{updatedLabel}</span>
          <span aria-hidden>·</span>
          <span>{t(ROLE_I18N_KEYS[note.role])}</span>
          {isDefault && (
            <>
              <span aria-hidden>·</span>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
                {t("notes.switcher.defaultBadge")}
              </Badge>
            </>
          )}
        </span>
        <span className="text-muted-foreground mt-1.5 flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {note.pageCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {note.memberCount}
          </span>
        </span>
      </span>
    </>
  );
};

export interface NoteListRowProps {
  note: NoteSummary;
  variant?: NoteListRowVariant;
  index?: number;
  isDefault?: boolean;
  isActive?: boolean;
  isPinned?: boolean;
  showPinAction?: boolean;
  onTogglePin?: () => void;
}

/**
 * Note list / card row with metadata (no page previews).
 * プレビューなしのメタデータ中心ノート行。
 */
export const NoteListRow: React.FC<NoteListRowProps> = ({
  note,
  variant = "compact",
  index = 0,
  isDefault = false,
  isActive = false,
  isPinned = false,
  showPinAction = false,
  onTogglePin,
}) => {
  const { t } = useTranslation();
  const displayTitle = resolveNoteDisplayTitle(note.title, t("notes.untitledNote"));
  const pinLabel = isPinned ? t("notes.list.unpin") : t("notes.list.pin");

  return (
    <div
      className={cn(
        "group relative w-full",
        variant === "card" && "h-full",
        index <= 5 && "animate-fade-in opacity-0",
        index <= 5 && `stagger-${Math.min(index + 1, 5)}`,
      )}
      style={
        index <= 5
          ? { animationFillMode: "forwards", animationDelay: `${index * 50}ms` }
          : undefined
      }
    >
      <Link
        to={`/notes/${note.id}`}
        aria-label={displayTitle}
        className={cn(
          "border-border/50 bg-card hover:border-border hover:bg-muted/30 flex w-full items-center gap-3 rounded-lg border text-left transition-colors",
          variant === "card" ? "h-full p-4" : "p-3",
          isActive && "border-primary/40 bg-accent/30",
        )}
      >
        <NoteListRowContent
          note={note}
          variant={variant}
          isDefault={isDefault}
          isActive={isActive}
          isPinned={isPinned}
        />
      </Link>
      {showPinAction && onTogglePin && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-2 right-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
            isPinned && "opacity-100",
          )}
          aria-label={pinLabel}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin();
          }}
        >
          {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
};

interface NoteSwitcherRowProps {
  note: NoteSummary;
  isDefault: boolean;
  isActive: boolean;
  isPinned: boolean;
  onSelect: () => void;
}

/**
 * Dropdown row for {@link NoteTitleSwitcher} (link + compact metadata).
 * {@link NoteTitleSwitcher} 用のドロップダウン行。
 */
export const NoteSwitcherRow = React.forwardRef<HTMLAnchorElement, NoteSwitcherRowProps>(
  function NoteSwitcherRow({ note, isDefault, isActive, isPinned, onSelect }, ref) {
    const { t } = useTranslation();
    const title = resolveNoteDisplayTitle(note.title, t("notes.untitledNote"));
    const updatedLabel = formatTimeAgo(note.updatedAt);

    return (
      <Link
        ref={ref}
        to={`/notes/${note.id}`}
        aria-current={isActive ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "hover:bg-accent flex w-full items-center gap-3 rounded-md px-2.5 py-2",
          isActive && "bg-accent/60",
        )}
      >
        <span
          className={cn("w-1 shrink-0 self-stretch rounded-full", ROLE_ACCENT_CLASS[note.role])}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-sm", isActive && "font-medium")}>{title}</span>
            {isPinned && <Pin className="text-muted-foreground h-3 w-3 shrink-0" aria-hidden />}
            {isDefault && (
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                {t("notes.switcher.defaultBadge")}
              </Badge>
            )}
          </span>
          <span className="text-muted-foreground mt-0.5 text-xs">
            {updatedLabel} · {note.pageCount} {t("notes.list.pagesShort")}
          </span>
        </span>
      </Link>
    );
  },
);
