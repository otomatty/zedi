import React, { useCallback, useMemo, useState } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { ChevronsUpDown, ListTree, Plus } from "lucide-react";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useMyNote, useNotes } from "@/hooks/useNoteQueries";
import { buildSwitcherNotes } from "@/lib/noteListSections";
import { isNotePinned } from "@/lib/notePinnedStorage";
import { usePinnedNotes } from "@/hooks/usePinnedNotes";
import { NoteSwitcherRow } from "./NoteListRow";

/**
 * URL から現在開いているノートの id を解決する。`/notes/:noteId` 系のみが
 * 有効で、`/notes` や `/notes/me`、`/notes/discover`、`/notes/official-guide`
 * といった兄弟ルートはノートビューではないためアクティブ判定の対象外とする。
 *
 * Resolve the active note id from the current URL. Only `/notes/:noteId`
 * (and its sub-paths) resolve to a noteId — sibling routes such as
 * `/notes`, `/notes/me`, `/notes/discover`, and `/notes/official-guide`
 * stay unmarked because they are not editable note views.
 */
function resolveActiveNoteId(pathname: string): string | null {
  const reservedSegments = new Set(["me", "discover", "official-guide"]);
  const match = matchPath({ path: "/notes/:noteId", end: false }, pathname);
  const id = match?.params.noteId;
  if (!id) return null;
  if (reservedSegments.has(id)) return null;
  return id;
}

/**
 * `NoteTitleSwitcher` のレイアウトバリアント。
 * - `heading`: ノート詳細ページのメインタイトル想定。`<h1>` の見た目。
 * - `subtitle`: 設定/メンバー画面でノート名を補足表示する位置想定。`text-sm` のサブテキスト。
 *
 * Layout variant for `NoteTitleSwitcher`.
 * - `heading`: main page title (note detail) — looks like an `<h1>`.
 * - `subtitle`: supporting note-name line on settings/members pages.
 */
export type NoteTitleSwitcherVariant = "heading" | "subtitle";

interface NoteTitleSwitcherProps {
  /** 現在表示しているノートの id。アクティブ行と新規/一覧フッターの判定に利用。 */
  noteId: string;
  /** タイトルとして表示する文字列。空のときは i18n の `notes.untitledNote` にフォールバック。 */
  noteTitle: string;
  /** レイアウトバリアント。詳細ページは `heading`、設定/メンバー画面は `subtitle`。 */
  variant?: NoteTitleSwitcherVariant;
  /** 任意の追加クラス。レイアウト調整に使う。タイトルは折り返しで全文表示する。 */
  className?: string;
}

/**
 * トリガーボタンの余白・タイポグラフィをバリアントごとに切り替える。
 */
const triggerVariantClass: Record<NoteTitleSwitcherVariant, string> = {
  heading: "text-foreground text-xl font-semibold gap-2.5 -ml-2 px-3 py-1.5",
  subtitle: "text-muted-foreground text-sm gap-2 px-3 py-1.5",
};

/**
 * ノートのタイトル自体をクリックトリガーとするノート切替 UI。ピン留めと
 * 最近更新したノートのみを表示し、フル一覧は `/notes` に誘導する。
 *
 * Note-title-as-switcher: shows pinned + recently updated notes only; full
 * catalog lives on `/notes`.
 */
export const NoteTitleSwitcher: React.FC<NoteTitleSwitcherProps> = ({
  noteId,
  noteTitle,
  variant = "heading",
  className,
}) => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const isAuthed = isSignedIn === true;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const notesQuery = useNotes();
  const myNoteQuery = useMyNote({ enabled: isAuthed });
  const defaultNoteId = myNoteQuery.data?.id ?? null;
  const { pinnedIds } = usePinnedNotes({ defaultNoteId });

  const location = useLocation();
  const activeNoteId = useMemo(
    () => resolveActiveNoteId(location.pathname) ?? noteId,
    [location.pathname, noteId],
  );

  const switcherNotes = useMemo(
    () => buildSwitcherNotes(notesQuery.data ?? [], pinnedIds, defaultNoteId),
    [notesQuery.data, pinnedIds, defaultNoteId],
  );

  const displayTitle = noteTitle.trim().length > 0 ? noteTitle : t("notes.untitledNote");
  const variantClass = triggerVariantClass[variant];

  if (!isAuthed) {
    return (
      <span className={cn("inline-block whitespace-nowrap", variantClass, className)}>
        {displayTitle}
      </span>
    );
  }

  const isLoading = notesQuery.isLoading;
  const isEmpty = !isLoading && switcherNotes.length === 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("notes.switcher.trigger")}
          className={cn(
            "group hover:bg-muted/70 focus-visible:ring-ring data-[state=open]:bg-muted inline-flex items-center rounded-lg text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
            variantClass,
            className,
          )}
        >
          <span className="whitespace-nowrap">{displayTitle}</span>
          <ChevronsUpDown
            aria-hidden="true"
            className={cn(
              "text-muted-foreground shrink-0 opacity-70 transition-opacity group-hover:opacity-100 group-data-[state=open]:opacity-100",
              variant === "heading" ? "h-5 w-5" : "h-4 w-4",
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="max-w-[min(38rem,calc(100vw-2rem))] min-w-80 overflow-hidden rounded-xl p-0 shadow-lg"
      >
        <DropdownMenuLabel className="text-muted-foreground px-4 pt-3 pb-2 text-[10px] font-semibold tracking-[0.08em] uppercase">
          {t("notes.switcher.heading")}
        </DropdownMenuLabel>

        {isLoading && (
          <p role="status" aria-live="polite" className="text-muted-foreground px-4 pb-3 text-sm">
            {t("notes.switcher.loading")}
          </p>
        )}

        {isEmpty && (
          <p className="text-muted-foreground px-4 pb-3 text-sm">{t("notes.switcher.empty")}</p>
        )}

        {!isLoading && switcherNotes.length > 0 && (
          <ScrollArea className="max-h-80">
            <div className="space-y-0.5 px-2 pb-2">
              {switcherNotes.map((note) => (
                <DropdownMenuItem
                  key={note.id}
                  asChild
                  onSelect={close}
                  className="cursor-pointer p-0 focus:bg-transparent"
                >
                  <NoteSwitcherRow
                    note={note}
                    isDefault={note.id === defaultNoteId}
                    isActive={note.id === activeNoteId}
                    isPinned={isNotePinned(note.id, pinnedIds) || note.id === defaultNoteId}
                    onSelect={close}
                  />
                </DropdownMenuItem>
              ))}
            </div>
          </ScrollArea>
        )}

        <DropdownMenuSeparator className="my-0" />
        <div className="space-y-0.5 px-2 py-2">
          <DropdownMenuItem
            asChild
            onSelect={close}
            className="cursor-pointer gap-3 rounded-md px-2.5 py-2"
          >
            <Link to="/notes?new=1" className="flex w-full items-center gap-3">
              <span className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium">{t("notes.switcher.newNote")}</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            asChild
            onSelect={close}
            className="cursor-pointer gap-3 rounded-md px-2.5 py-2"
          >
            <Link to="/notes" className="flex w-full items-center gap-3">
              <span className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                <ListTree aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium">{t("notes.switcher.allNotes")}</span>
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NoteTitleSwitcher;
