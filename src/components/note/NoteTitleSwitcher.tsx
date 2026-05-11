import React, { useCallback, useMemo, useState } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { Check, ChevronsUpDown, NotebookText, Plus, ListTree } from "lucide-react";
import {
  Badge,
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
 * ドロップダウンに直接並べる行数の上限。これを超える場合はフッターの
 * 「すべてのノートを見る」リンクから `/notes` に誘導し、メニューが肥大化
 * しないようにする（issue #827 を踏襲）。
 *
 * Hard cap on the number of rows the dropdown renders inline. Beyond this we
 * funnel users to `/notes` via the "see all" footer link rather than letting
 * the menu balloon (carried over from the former header switcher).
 */
const MAX_ROWS = 50;

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

interface NoteRowProps {
  note: NoteSummary;
  isDefault: boolean;
  isActive: boolean;
  onSelect: () => void;
}

/**
 * スイッチャー内の 1 ノート行。デフォルトノートには `既定 / Default` バッジを
 * 付け、現在開いているノートには `aria-current=true` とチェックアイコンを
 * 付与する。リンク先は `NoteView` が解釈する `/notes/:noteId`。
 *
 * One note row inside the switcher dropdown. The default note keeps a
 * `既定 / Default` badge; the currently open note carries `aria-current=true`
 * and a leading check icon.
 */
const NoteRow: React.FC<NoteRowProps> = ({ note, isDefault, isActive, onSelect }) => {
  const { t } = useTranslation();
  const title = note.title.trim().length > 0 ? note.title : t("notes.untitledNote");
  return (
    <DropdownMenuItem
      asChild
      onSelect={onSelect}
      className={cn(
        "cursor-pointer gap-3 rounded-md px-2.5 py-2",
        isActive && "bg-accent/60 data-highlighted:bg-accent",
      )}
    >
      <Link
        to={`/notes/${note.id}`}
        aria-current={isActive ? "true" : undefined}
        className="flex w-full items-center gap-3"
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center",
            isActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          {isActive ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <NotebookText aria-hidden="true" className="h-4 w-4" />
          )}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            isActive ? "text-foreground font-medium" : "text-foreground",
          )}
        >
          {title}
        </span>
        {isDefault && (
          <Badge
            variant="secondary"
            className="shrink-0 px-1.5 py-0 text-[10px] font-medium tracking-wide uppercase"
          >
            {t("notes.switcher.defaultBadge")}
          </Badge>
        )}
      </Link>
    </DropdownMenuItem>
  );
};

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
 * - `heading`: 本文タイトルとして使うため、左端のテキスト位置を保つよう
 *   負の左マージンを当てつつ、内側パディングでクリックターゲットを広くする。
 * - `subtitle`: 補助行・チップとして使うため、両側に同等のパディングを置く
 *   （タップ領域を十分に確保）。
 *
 * Variant-specific spacing/typography for the trigger button.
 * `heading` keeps the title text visually flush with the container's left
 * edge via a negative inline margin while still giving the click target
 * comfortable inner padding; `subtitle` is a balanced chip-style trigger with
 * enough padding for a comfortable tap target.
 */
const triggerVariantClass: Record<NoteTitleSwitcherVariant, string> = {
  heading: "text-foreground text-xl font-semibold gap-2.5 -ml-2 px-3 py-1.5",
  subtitle: "text-muted-foreground text-sm gap-2 px-3 py-1.5",
};

/**
 * ノートのタイトル自体をクリックトリガーとするノート切替 UI。ヘッダーの
 * 旧 `NoteSwitcher` を廃止する代わりに、ノート詳細・設定・メンバーの
 * 各画面で同じ動作を提供する。
 *
 * - サインイン中: ドロップダウンを開き、所属ノートをデフォルト先頭・
 *   `updatedAt` 降順で表示。フッターから `/notes?new=1` と `/notes` に遷移。
 * - 未サインイン: 静的にタイトルを表示するだけにフォールバックする
 *   （公開ノートのゲスト閲覧で誤ってトリガー化しないため）。
 *
 * Note-title-as-switcher: replaces the legacy header `NoteSwitcher` and
 * appears on the note detail / settings / members pages. Signed-in users
 * get the dropdown; guests fall back to a static label so public notes
 * stay readable without exposing a no-op trigger.
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
  const myNoteId = myNoteQuery.data?.id ?? null;

  const location = useLocation();
  const activeNoteId = useMemo(
    () => resolveActiveNoteId(location.pathname) ?? noteId,
    [location.pathname, noteId],
  );

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

  const displayTitle = noteTitle.trim().length > 0 ? noteTitle : t("notes.untitledNote");
  const variantClass = triggerVariantClass[variant];

  // 未サインイン時はトリガー化せず、テキストとしてだけ描画する。
  // Guests see the title as plain text — no dropdown is wired up.
  if (!isAuthed) {
    return (
      <span className={cn("inline-block whitespace-nowrap", variantClass, className)}>
        {displayTitle}
      </span>
    );
  }

  const isLoading = notesQuery.isLoading;
  const isEmpty = !isLoading && sortedNotes.length === 0;

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

        {!isLoading && sortedNotes.length > 0 && (
          <ScrollArea className="max-h-80">
            <div className="space-y-0.5 px-2 pb-2">
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
