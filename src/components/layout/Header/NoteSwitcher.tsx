import React, { useCallback, useMemo, useState } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { Check, ChevronsUpDown, NotebookText, Plus, ListTree } from "lucide-react";
import {
  Badge,
  Button,
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
import type { NoteSummary } from "@/types/note";

/**
 * Hard cap on the number of rows the dropdown renders inline. Beyond this we
 * funnel users to `/notes` via the "see all" footer link rather than letting
 * the menu balloon. Tuned per issue #827; revisit if a tenant-scale UX hits
 * the cap regularly.
 *
 * ドロップダウンに直接並べる行数の上限。これを超える場合はフッターの
 * 「すべてのノートを見る」リンクから `/notes` に誘導し、メニューが肥大化
 * しないようにする（issue #827）。テナントによって日常的に超える運用が
 * 出てきたら見直す。
 */
const MAX_ROWS = 50;

/**
 * Resolve the active note id from the current URL. Only `/notes/:noteId`
 * (and its sub-paths) resolve to a noteId — sibling routes such as
 * `/notes`, `/notes/me`, `/notes/discover`, and `/notes/official-guide`
 * stay unmarked because they are not editable note views.
 *
 * URL から現在開いているノートの id を解決する。`/notes/:noteId` 系のみが
 * 有効で、`/notes` や `/notes/me`、`/notes/discover`、`/notes/official-guide`
 * といった兄弟ルートはノートビューではないためアクティブ判定の対象外とする。
 */
function resolveActiveNoteId(pathname: string): string | null {
  const reservedSegments = new Set(["me", "discover", "official-guide"]);
  const match = matchPath({ path: "/notes/:noteId", end: false }, pathname);
  const id = match?.params.noteId;
  if (!id) return null;
  if (reservedSegments.has(id)) return null;
  return id;
}

const SwitcherTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>((props, ref) => {
  const { t } = useTranslation();
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      aria-label={t("notes.switcher.trigger")}
      className="text-foreground hover:bg-muted h-9 gap-2 px-2"
      {...props}
    >
      <NotebookText aria-hidden="true" className="h-4 w-4" />
      <span className="hidden text-sm font-medium md:inline">{t("notes.switcher.trigger")}</span>
      <ChevronsUpDown aria-hidden="true" className="text-muted-foreground h-3.5 w-3.5" />
    </Button>
  );
});
SwitcherTrigger.displayName = "SwitcherTrigger";

interface NoteRowProps {
  note: NoteSummary;
  isDefault: boolean;
  isActive: boolean;
  onSelect: () => void;
}

/**
 * One note row inside the switcher dropdown. The default note keeps a
 * `既定 / Default` badge; the currently open note carries `aria-current=true`
 * and a leading check icon. The link target is `/notes/:noteId`, matching
 * the route shape consumed by `NoteView`.
 *
 * スイッチャー内の 1 ノート行。デフォルトノートには `既定 / Default` バッジを
 * 付け、現在開いているノートには `aria-current=true` とチェックアイコンを
 * 付与する。リンク先は `NoteView` が解釈する `/notes/:noteId`。
 */
const NoteRow: React.FC<NoteRowProps> = ({ note, isDefault, isActive, onSelect }) => {
  const { t } = useTranslation();
  const title = note.title.trim().length > 0 ? note.title : t("notes.untitledNote");
  return (
    <DropdownMenuItem
      asChild
      onSelect={onSelect}
      className={cn(
        "cursor-pointer gap-2 py-1.5 pr-2 pl-2",
        isActive && "bg-accent/60 data-[highlighted]:bg-accent",
      )}
    >
      <Link
        to={`/notes/${note.id}`}
        aria-current={isActive ? "true" : undefined}
        className="flex w-full items-center gap-2"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {isActive ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <NotebookText aria-hidden="true" className="text-muted-foreground h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        {isDefault && (
          <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
            {t("notes.switcher.defaultBadge")}
          </Badge>
        )}
      </Link>
    </DropdownMenuItem>
  );
};

/**
 * Header-mounted note switcher. Lists the current user's notes, pins the
 * default note to the top with a badge, and offers shortcuts to the notes
 * index (`/notes`) and the create-note flow. Mirrors the issue #827 spec:
 * a dropdown rather than a sidebar, accessible from any AppLayout-wrapped
 * page (desktop and mobile).
 *
 * ヘッダー内のノート切替 UI。サインイン中ユーザーのノートを並べ、デフォルト
 * ノートはバッジ付きで先頭に固定する。フッターには `/notes` 一覧と
 * 新規作成フローへのショートカットを置く。issue #827 のドロップダウン案を
 * 踏襲し、AppLayout 配下のあらゆるページ（モバイル含む）から開けるようにする。
 */
export const NoteSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const isAuthed = isSignedIn === true;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const notesQuery = useNotes();
  const myNoteQuery = useMyNote({ enabled: isAuthed });
  const myNoteId = myNoteQuery.data?.id ?? null;

  const location = useLocation();
  const activeNoteId = useMemo(() => resolveActiveNoteId(location.pathname), [location.pathname]);

  const sortedNotes = useMemo<NoteSummary[]>(() => {
    const list = notesQuery.data ?? [];
    const live = list.filter((note) => !note.isDeleted);
    const def = myNoteId ? (live.find((note) => note.id === myNoteId) ?? null) : null;
    const others = live
      .filter((note) => note.id !== def?.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const ordered = def ? [def, ...others] : others;
    return ordered.slice(0, MAX_ROWS);
  }, [notesQuery.data, myNoteId]);

  if (!isAuthed) return null;

  const isLoading = notesQuery.isLoading;
  const isEmpty = !isLoading && sortedNotes.length === 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <SwitcherTrigger />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-72 p-0">
        <DropdownMenuLabel className="text-muted-foreground px-3 py-2 text-xs font-medium tracking-wide uppercase">
          {t("notes.switcher.heading")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />

        {isLoading && (
          <p role="status" aria-live="polite" className="text-muted-foreground px-3 py-3 text-sm">
            {t("notes.switcher.loading")}
          </p>
        )}

        {isEmpty && (
          <p className="text-muted-foreground px-3 py-3 text-sm">{t("notes.switcher.empty")}</p>
        )}

        {!isLoading && sortedNotes.length > 0 && (
          <ScrollArea className="max-h-72">
            <div className="p-1">
              {sortedNotes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  isDefault={note.id === myNoteId}
                  isActive={note.id === activeNoteId}
                  onSelect={close}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem asChild onSelect={close} className="cursor-pointer gap-2">
            <Link to="/notes?new=1" className="flex w-full items-center gap-2">
              <Plus aria-hidden="true" className="h-4 w-4" />
              <span className="text-sm">{t("notes.switcher.newNote")}</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild onSelect={close} className="cursor-pointer gap-2">
            <Link to="/notes" className="flex w-full items-center gap-2">
              <ListTree aria-hidden="true" className="h-4 w-4" />
              <span className="text-sm">{t("notes.switcher.allNotes")}</span>
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NoteSwitcher;
