import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { NoteEditPermission, NoteVisibility } from "@/types/note";
import { allowedEditPermissions, editPermissionKeys, visibilityKeys } from "./noteSettingsConfig";

/**
 *
 */
export interface NoteSettingsVisibilitySectionProps {
  title: string;
  setTitle: (v: string) => void;
  visibility: NoteVisibility;
  setVisibility: (v: NoteVisibility) => void;
  editPermission: NoteEditPermission;
  setEditPermission: (v: NoteEditPermission) => void;
  onSaveNote: () => void;
  isSaving: boolean;
}

/**
 *
 */
export function NoteSettingsVisibilitySection({
  title,
  setTitle,
  visibility,
  setVisibility,
  editPermission,
  setEditPermission,
  onSaveNote,
  isSaving,
}: NoteSettingsVisibilitySectionProps) {
  /**
   *
   */
  const { t } = useTranslation();
  return (
    <section className="mt-6 rounded-lg border border-border/60 p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("notes.visibilitySettings")}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="note-title-input">{t("notes.noteTitle")}</Label>
          <Input
            id="note-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("notes.noteTitlePlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("notes.visibility")}</Label>
          <Select
            value={visibility}
            onValueChange={(value) => {
              /**
               *
               */
              const next = value as NoteVisibility;
              setVisibility(next);
              /**
               *
               */
              const allowed = allowedEditPermissions[next];
              if (!allowed.includes(editPermission)) {
                setEditPermission(allowed[0]);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("notes.selectVisibility")} />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(visibilityKeys) as NoteVisibility[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(visibilityKeys[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("notes.editPermission")}</Label>
          <Select
            value={editPermission}
            onValueChange={(v) => setEditPermission(v as NoteEditPermission)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedEditPermissions[visibility].map((value) => (
                <SelectItem key={value} value={value}>
                  {t(editPermissionKeys[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={onSaveNote} disabled={isSaving}>
          {isSaving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </section>
  );
}
