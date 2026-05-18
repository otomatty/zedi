import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Label, useToast } from "@zedi/ui";
import { useUpdateNote } from "@/hooks/useNoteQueries";
import { useNoteSettingsContext } from "../NoteSettingsContext";

/**
 * `/notes/:noteId/settings/general` — タイトル編集のみを扱う最小セクション。
 *
 * 旧 `NoteSettings` ではタイトル・公開範囲・編集権限を 1 ボタンで一括保存
 * していたが、サブルート化に伴い責務を分割した。公開範囲・編集権限は
 * `VisibilitySection` 側で固有の警告ダイアログを通して保存する。
 *
 * Title-only general section. Visibility / edit permission moved to
 * `VisibilitySection` so each subroute owns one cohesive save action.
 */
const GeneralSection: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { note, canManage } = useNoteSettingsContext();
  const updateNoteMutation = useUpdateNote();

  const [title, setTitle] = useState(note.title);

  useEffect(() => {
    // ノートが再取得されたらフォームを同期する（保存後の refetch で title が
    // 変わった場合などに整合させる）。
    // Sync the form when the underlying note refetches (e.g. after a save).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init from loaded note
    setTitle(note.title);
  }, [note.title]);

  const isDirty = title.trim() !== note.title.trim();

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast({ title: t("notes.titleRequired"), variant: "destructive" });
      return;
    }
    if (!isDirty) return;
    try {
      await updateNoteMutation.mutateAsync({
        noteId: note.id,
        updates: { title: trimmed },
      });
      toast({ title: t("notes.noteUpdated") });
    } catch (error) {
      console.error("Failed to update note title:", error);
      toast({ title: t("notes.noteUpdateFailed"), variant: "destructive" });
    }
  };

  return (
    <section className="border-border/60 rounded-lg border p-4">
      <header className="mb-4 space-y-1">
        <h2 className="text-base font-semibold">{t("notes.settingsNav.general")}</h2>
        <p className="text-muted-foreground text-xs">{t("notes.generalSectionDescription")}</p>
      </header>

      <div className="space-y-2">
        <Label htmlFor="note-settings-title">{t("notes.noteTitle")}</Label>
        <Input
          id="note-settings-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("notes.noteTitlePlaceholder")}
          readOnly={!canManage}
          aria-readonly={!canManage}
        />
      </div>

      {canManage ? (
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={updateNoteMutation.isPending || !isDirty}>
            {updateNoteMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground mt-3 text-xs" role="note">
          {t("notes.shareReadOnlyNotice")}
        </p>
      )}
    </section>
  );
};

export default GeneralSection;
