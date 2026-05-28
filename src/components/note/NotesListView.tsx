import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NoteSummary } from "@/types/note";
import { Input } from "@zedi/ui";
import { cn } from "@zedi/ui";
import { NoteListRow } from "./NoteListRow";
import {
  buildNoteListSections,
  filterNotesByTitle,
  sortNotes,
  type NoteListSort,
} from "@/lib/noteListSections";
import { isNotePinned } from "@/lib/notePinnedStorage";
import { usePinnedNotes } from "@/hooks/usePinnedNotes";
import { useMyNote } from "@/hooks/useNoteQueries";

interface NotesListViewProps {
  notes: NoteSummary[];
  isLoading: boolean;
}

interface NoteSectionProps {
  title: string;
  notes: NoteSummary[];
  defaultNoteId: string | null;
  pinnedIds: string[];
  showPinAction: boolean;
  onTogglePin: (noteId: string) => void;
  variant: "compact" | "card";
  indexOffset?: number;
}

const NoteSection: React.FC<NoteSectionProps> = ({
  title,
  notes,
  defaultNoteId,
  pinnedIds,
  showPinAction,
  onTogglePin,
  variant,
  indexOffset = 0,
}) => {
  if (notes.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-foreground mb-3 text-lg font-medium">{title}</h2>
      <div
        className={cn(
          variant === "compact"
            ? "flex flex-col gap-2"
            : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {notes.map((note, index) => (
          <NoteListRow
            key={note.id}
            note={note}
            variant={variant}
            index={indexOffset + index}
            isDefault={note.id === defaultNoteId}
            isPinned={isNotePinned(note.id, pinnedIds) || note.id === defaultNoteId}
            showPinAction={showPinAction && note.id !== defaultNoteId}
            onTogglePin={() => onTogglePin(note.id)}
          />
        ))}
      </div>
    </section>
  );
};

/**
 * Sectioned, searchable notes list for `/notes` (pinned / recent / all).
 * `/notes` 向けのセクション付き・検索可能なノート一覧。
 */
export const NotesListView: React.FC<NotesListViewProps> = ({ notes, isLoading }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NoteListSort>("updated");
  const { pinnedIds, togglePin } = usePinnedNotes();
  const { data: myNote } = useMyNote();
  const defaultNoteId = myNote?.id ?? null;

  const filtered = useMemo(() => filterNotesByTitle(notes, search), [notes, search]);

  const sections = useMemo(
    () => buildNoteListSections(filtered, pinnedIds, defaultNoteId),
    [filtered, pinnedIds, defaultNoteId],
  );

  const sortedAll = useMemo(() => sortNotes(sections.all, sort), [sections.all, sort]);

  const hasAny = sections.pinned.length > 0 || sections.recent.length > 0 || sortedAll.length > 0;

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("notes.list.searchPlaceholder")}
          aria-label={t("notes.list.searchPlaceholder")}
          className="max-w-md"
        />
        <div className="border-border flex shrink-0 rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setSort("updated")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              sort === "updated"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("notes.sortUpdated")}
          </button>
          <button
            type="button"
            onClick={() => setSort("title")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              sort === "title"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("notes.list.sortTitle")}
          </button>
        </div>
      </div>

      {!hasAny ? (
        <p className="text-muted-foreground text-sm">
          {search.trim() ? t("notes.list.noSearchResults") : t("notes.noNotesYet")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 md:hidden">
            <NoteSection
              title={t("notes.list.sectionPinned")}
              notes={sections.pinned}
              defaultNoteId={defaultNoteId}
              pinnedIds={pinnedIds}
              showPinAction
              onTogglePin={togglePin}
              variant="compact"
              indexOffset={0}
            />
            <NoteSection
              title={t("notes.list.sectionRecent")}
              notes={sections.recent}
              defaultNoteId={defaultNoteId}
              pinnedIds={pinnedIds}
              showPinAction
              onTogglePin={togglePin}
              variant="compact"
              indexOffset={sections.pinned.length}
            />
            <NoteSection
              title={t("notes.list.sectionAll")}
              notes={sortedAll}
              defaultNoteId={defaultNoteId}
              pinnedIds={pinnedIds}
              showPinAction
              onTogglePin={togglePin}
              variant="compact"
              indexOffset={sections.pinned.length + sections.recent.length}
            />
          </div>

          <div className="hidden md:block">
            <NoteSection
              title={t("notes.list.sectionPinned")}
              notes={sections.pinned}
              defaultNoteId={defaultNoteId}
              pinnedIds={pinnedIds}
              showPinAction
              onTogglePin={togglePin}
              variant="card"
              indexOffset={0}
            />
            <NoteSection
              title={t("notes.list.sectionRecent")}
              notes={sections.recent}
              defaultNoteId={defaultNoteId}
              pinnedIds={pinnedIds}
              showPinAction
              onTogglePin={togglePin}
              variant="card"
              indexOffset={sections.pinned.length}
            />
            <NoteSection
              title={t("notes.list.sectionAll")}
              notes={sortedAll}
              defaultNoteId={defaultNoteId}
              pinnedIds={pinnedIds}
              showPinAction
              onTogglePin={togglePin}
              variant="card"
              indexOffset={sections.pinned.length + sections.recent.length}
            />
          </div>
        </>
      )}
    </>
  );
};
