import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTrigger } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { Note } from "@/types/note";
import type { NotePageSummary } from "./noteViewHelpers";
import { NoteViewAddPageDialogContent } from "./NoteViewAddPageDialogContent";
import { ShareButton } from "./ShareModal/ShareButton";

/**
 *
 */
export interface NoteViewHeaderActionsProps {
  note: Note;
  canManageMembers: boolean;
  isSignedIn: boolean;
  canView: boolean;
  canShowAddPage: boolean;
  isAddPageOpen: boolean;
  setIsAddPageOpen: (v: boolean) => void;
  newPageTitle: string;
  setNewPageTitle: (v: string) => void;
  pageFilter: string;
  setPageFilter: (v: string) => void;
  filteredPages: NotePageSummary[];
  canEdit: boolean;
  onAddByTitle: () => Promise<void>;
  onAddByPageId: (pageId: string) => Promise<void>;
  addPagePending: boolean;
}

/**
 *
 */
export function NoteViewHeaderActions({
  note,
  canManageMembers,
  isSignedIn,
  canView,
  canShowAddPage,
  isAddPageOpen,
  setIsAddPageOpen,
  newPageTitle,
  setNewPageTitle,
  pageFilter,
  setPageFilter,
  filteredPages,
  canEdit,
  onAddByTitle,
  onAddByPageId,
  addPagePending,
}: NoteViewHeaderActionsProps) {
  /**
   *
   */
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      {canManageMembers && (
        <>
          <ShareButton note={note} canManageMembers={canManageMembers} />
          <Button asChild variant="outline" size="sm">
            <Link to={`/notes/${note.id}/settings`}>{t("notes.settings")}</Link>
          </Button>
        </>
      )}
      {!isSignedIn && canView && (
        <span className="text-muted-foreground text-sm">{t("notes.loginToPost")}</span>
      )}
      {canShowAddPage && (
        <Dialog open={isAddPageOpen} onOpenChange={setIsAddPageOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              {t("notes.addPage")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NoteViewAddPageDialogContent
              newPageTitle={newPageTitle}
              setNewPageTitle={setNewPageTitle}
              pageFilter={pageFilter}
              setPageFilter={setPageFilter}
              filteredPages={filteredPages}
              canEdit={canEdit}
              onAddByTitle={onAddByTitle}
              onAddByPageId={onAddByPageId}
              isPending={addPagePending}
              onClose={() => setIsAddPageOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
