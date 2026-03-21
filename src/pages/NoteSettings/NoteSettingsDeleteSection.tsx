import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 *
 */
export interface NoteSettingsDeleteSectionProps {
  isDeleteDialogOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
  noteTitle: string;
}

/**
 *
 */
export function NoteSettingsDeleteSection({
  isDeleteDialogOpen,
  onOpenChange,
  onConfirmDelete,
  isDeleting,
  noteTitle,
}: NoteSettingsDeleteSectionProps) {
  /**
   *
   */
  const { t } = useTranslation();
  return (
    <>
      <section className="mt-6 rounded-lg border border-destructive/40 p-4">
        <h2 className="mb-3 text-sm font-semibold text-destructive">{t("notes.deleteSection")}</h2>
        <p className="text-sm text-muted-foreground">{t("notes.deleteSectionDescription")}</p>
        <div className="mt-4 flex justify-end">
          <Button variant="destructive" onClick={() => onOpenChange(true)}>
            {t("notes.deleteNote")}
          </Button>
        </div>
      </section>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notes.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("notes.deleteConfirmDescription", { title: noteTitle })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? t("notes.deleting") : t("notes.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
