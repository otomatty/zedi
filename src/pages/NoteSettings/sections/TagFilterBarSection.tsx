import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Label, Switch, useToast } from "@zedi/ui";
import { useUpdateNote } from "@/hooks/useNoteQueries";
import { useNoteSettingsContext } from "../NoteSettingsContext";
import { useTagFilterBarPreference } from "@/hooks/useTagFilterBarPreference";

/**
 * `/notes/:noteId/settings/filter-bar` — オーナー向け「タグフィルタバー」設定。
 *
 * - DB 側の `showTagFilterBar` (既定で表示するか) を切り替える。
 * - 補足としてユーザー側の上書き状態を表示する (read-only)。
 *
 * `default_filter_tags` の編集 UI は将来の拡張に譲り、本セクションではバーの
 * ON/OFF 既定のみを扱う (MVP)。
 *
 * Owner-only section for the tag filter bar settings on
 * `/notes/:noteId/settings/filter-bar`. Toggles the DB-side
 * `showTagFilterBar` flag and surfaces the per-user override read-only.
 * Default-tag editing is deferred to a follow-up.
 */
const TagFilterBarSection: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { note, canManage } = useNoteSettingsContext();
  const updateNoteMutation = useUpdateNote();
  const { userOverride } = useTagFilterBarPreference(note.id);

  const [showByDefault, setShowByDefault] = useState(note.showTagFilterBar);

  useEffect(() => {
    // ノートが再取得されたらフォームを同期する（保存後の refetch で値が変わった
    // 場合などに整合させる）。
    // Sync the form when the note refetches; matches `GeneralSection.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init from loaded note
    setShowByDefault(note.showTagFilterBar);
  }, [note.showTagFilterBar]);

  const isDirty = showByDefault !== note.showTagFilterBar;

  const userOverrideLabel = useMemo(() => {
    if (userOverride === undefined) return t("notes.filterBarSettings.userOverrideHint");
    return userOverride
      ? t("notes.filterBarSettings.userOverrideOn")
      : t("notes.filterBarSettings.userOverrideOff");
  }, [t, userOverride]);

  const handleSave = async () => {
    if (!isDirty) return;
    try {
      await updateNoteMutation.mutateAsync({
        noteId: note.id,
        updates: { showTagFilterBar: showByDefault },
      });
      toast({ title: t("notes.noteUpdated") });
    } catch (error) {
      console.error("Failed to update tag filter bar setting:", error);
      toast({ title: t("notes.noteUpdateFailed"), variant: "destructive" });
    }
  };

  return (
    <section className="border-border/60 rounded-lg border p-4">
      <header className="mb-4 space-y-1">
        <h2 className="text-base font-semibold">{t("notes.filterBarSettings.title")}</h2>
        <p className="text-muted-foreground text-xs">{t("notes.filterBarSettings.description")}</p>
      </header>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="tag-filter-bar-show-default" className="text-sm font-medium">
            {t("notes.filterBarSettings.showByDefault")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {t("notes.filterBarSettings.showByDefaultHelp")}
          </p>
        </div>
        <Switch
          id="tag-filter-bar-show-default"
          checked={showByDefault}
          onCheckedChange={setShowByDefault}
          disabled={!canManage}
        />
      </div>

      <p className="text-muted-foreground mt-3 text-xs" role="note">
        {userOverrideLabel}
      </p>

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

export default TagFilterBarSection;
