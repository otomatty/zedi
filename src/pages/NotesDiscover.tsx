import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { NotesLayout } from "@/components/note/NotesLayout";
import { NoteCard } from "@/components/note/NoteCard";
import { usePublicNotes, mapDiscoverItemToNoteSummary } from "@/hooks/useNoteQueries";
import type { NoteSummary } from "@/types/note";
import { cn } from "@zedi/ui";

const NotesDiscover: React.FC = () => {
  const { t } = useTranslation();
  const [sort, setSort] = useState<"updated" | "popular">("updated");

  const { data, isLoading } = usePublicNotes(sort, 20, 0);

  const officialSummaries: NoteSummary[] = (data?.official ?? []).map(mapDiscoverItemToNoteSummary);
  const normalSummaries: NoteSummary[] = (data?.notes ?? []).map(mapDiscoverItemToNoteSummary);

  return (
    <NotesLayout>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <>
          {officialSummaries.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t("notes.sectionOfficial")}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {officialSummaries.map((note, index) => (
                  <NoteCard key={note.id} note={note} index={index} />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-medium text-foreground">
                {t("notes.sectionPublicNotes")}
              </h2>
              <div className="flex rounded-lg border border-border p-0.5">
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
                  onClick={() => setSort("popular")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    sort === "popular"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("notes.sortPopular")}
                </button>
              </div>
            </div>
            {normalSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("notes.noNotesYet")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {normalSummaries.map((note, index) => (
                  <NoteCard key={note.id} note={note} index={index} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </NotesLayout>
  );
};

export default NotesDiscover;
