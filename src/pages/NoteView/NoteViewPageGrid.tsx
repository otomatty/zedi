import { Trash2 } from "lucide-react";
import { NotePageCard } from "@/components/note/NotePageCard";
import { Button } from "@zedi/ui";
import type { NotePageSummary } from "./noteViewHelpers";

/**
 *
 */
export interface NoteViewPageGridProps {
  noteId: string;
  notePages: NotePageSummary[];
  canDeletePage: (addedByUserId: string | null | undefined) => boolean;
  onRemovePage: (pageId: string) => Promise<void>;
}

/**
 *
 */
export function NoteViewPageGrid({
  noteId,
  notePages,
  canDeletePage,
  onRemovePage,
}: NoteViewPageGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {notePages.map((page) => (
        <div key={page.id} className="relative">
          <NotePageCard noteId={noteId} page={page} />
          {canDeletePage(page.addedByUserId) && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 h-7 w-7"
              onClick={() => onRemovePage(page.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
