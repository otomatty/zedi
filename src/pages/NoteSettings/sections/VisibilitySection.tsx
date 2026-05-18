import React, { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Input, Label, RadioGroup, RadioGroupItem, useToast } from "@zedi/ui";
import type { NoteEditPermission, NoteVisibility } from "@/types/note";
import { allowedEditPermissions, visibilityKeys } from "@/lib/noteSettingsConfig";
import { DefaultNotePublicWarningDialog } from "../DefaultNotePublicWarningDialog";
import { PublicAnyLoggedInSaveAlertDialog } from "../PublicAnyLoggedInSaveAlertDialog";
import { useNoteSettingsSaveWithPublicConfirm } from "../useNoteSettingsSaveWithPublicConfirm";
import { useNoteSettingsContext } from "../NoteSettingsContext";

/**
 * 公開設定 radio 1 行分の i18n キー（説明文）。
 * Description i18n keys for each visibility radio row.
 */
const visibilityDescriptionKeys: Record<NoteVisibility, string> = {
  private: "notes.shareVisibilityDescriptionPrivate",
  unlisted: "notes.shareVisibilityDescriptionUnlisted",
  public: "notes.shareVisibilityDescriptionPublic",
  restricted: "notes.shareVisibilityDescriptionRestricted",
};

/**
 * 編集権限 radio のラベル / 説明文 i18n キー。
 * Label / description i18n keys for each edit-permission radio row.
 */
const editPermissionLabelKeys: Record<NoteEditPermission, string> = {
  owner_only: "notes.editPermissionOwnerOnly",
  members_editors: "notes.editPermissionMembersEditors",
  any_logged_in: "notes.editPermissionAnyLoggedIn",
};

const editPermissionDescriptionKeys: Record<NoteEditPermission, string> = {
  owner_only: "notes.editPermissionHelpOwnerOnly",
  members_editors: "notes.editPermissionHelpMembersEditors",
  any_logged_in: "notes.editPermissionHelpAnyLoggedIn",
};

const VISIBILITY_ORDER: NoteVisibility[] = ["private", "unlisted", "public", "restricted"];
const EDIT_PERMISSION_ORDER: NoteEditPermission[] = [
  "owner_only",
  "members_editors",
  "any_logged_in",
];

interface VisibilityOptionRowProps {
  value: NoteVisibility;
  selectedVisibility: NoteVisibility;
  canEdit: boolean;
  noteUrl: string;
  onCopyNoteUrl: () => void;
}

function VisibilityOptionRow({
  value,
  selectedVisibility,
  canEdit,
  noteUrl,
  onCopyNoteUrl,
}: VisibilityOptionRowProps) {
  const { t } = useTranslation();
  const inputId = `visibility-section-${value}`;
  return (
    <div className="border-border/60 flex gap-3 rounded-md border p-3">
      <RadioGroupItem value={value} id={inputId} disabled={!canEdit} className="mt-1" />
      <div className="flex-1 space-y-1">
        <Label htmlFor={inputId} className="text-sm font-medium">
          {t(visibilityKeys[value])}
        </Label>
        <p className="text-muted-foreground text-xs">{t(visibilityDescriptionKeys[value])}</p>
        {value === "unlisted" && selectedVisibility === "unlisted" ? (
          <div className="mt-2 space-y-1">
            <p className="text-muted-foreground text-xs">{t("notes.shareUnlistedUrlHint")}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                aria-label={t("notes.shareLink")}
                value={noteUrl}
                readOnly
                className="text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={onCopyNoteUrl}>
                <Copy className="mr-2 h-4 w-4" />
                {t("notes.copy")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface EditPermissionOptionRowProps {
  value: NoteEditPermission;
  allowedEditOptions: readonly NoteEditPermission[];
  canEdit: boolean;
}

function EditPermissionOptionRow({
  value,
  allowedEditOptions,
  canEdit,
}: EditPermissionOptionRowProps) {
  const { t } = useTranslation();
  const inputId = `visibility-section-edit-${value}`;
  const enabled = allowedEditOptions.includes(value);
  return (
    <div
      className="border-border/60 flex gap-3 rounded-md border p-3 data-[disabled=true]:opacity-60"
      data-disabled={!enabled || !canEdit}
    >
      <RadioGroupItem value={value} id={inputId} disabled={!enabled || !canEdit} className="mt-1" />
      <div className="flex-1 space-y-1">
        <Label htmlFor={inputId} className="text-sm font-medium">
          {t(editPermissionLabelKeys[value])}
        </Label>
        <p className="text-muted-foreground text-xs">{t(editPermissionDescriptionKeys[value])}</p>
      </div>
    </div>
  );
}

/**
 * `/notes/:noteId/settings/visibility` — 公開範囲・編集権限・共有 URL を扱う。
 *
 * 旧仕様では `NoteSettings` 全体で 1 ボタン保存だったが、サブルート化に伴い
 * このセクションだけで完結する保存ボタンに切り替えた。`title` は現状値を
 * そのまま渡し、副作用で title が変化することはない。
 *
 * Visibility + edit-permission section with self-contained save. `title`
 * stays untouched (the General section owns it). Reuses the dual-dialog
 * confirmation flow for default-note exposure and `public + any_logged_in`.
 */
const VisibilitySection: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { note, canManage } = useNoteSettingsContext();

  const [visibility, setVisibility] = useState<NoteVisibility>(note.visibility);
  const [editPermission, setEditPermission] = useState<NoteEditPermission>(note.editPermission);

  useEffect(() => {
    // Sync local state on refetch (after save / external update).
    // ノート再取得時にフォーム状態を同期する。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init from loaded note
    setVisibility(note.visibility);
    setEditPermission(note.editPermission);
  }, [note.visibility, note.editPermission]);

  const {
    handleSaveNote,
    confirmOpen,
    setConfirmOpen,
    handleConfirmPublicAnyLoggedInSave,
    defaultNoteWarningOpen,
    setDefaultNoteWarningOpen,
    handleConfirmDefaultNoteWarning,
    isSaving,
  } = useNoteSettingsSaveWithPublicConfirm({
    noteId: note.id,
    note,
    title: note.title,
    visibility,
    editPermission,
  });

  const noteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/notes/${note.id}`;
  }, [note.id]);

  const handleCopyNoteUrl = async () => {
    try {
      await navigator.clipboard.writeText(noteUrl);
      toast({ title: t("notes.linkCopied") });
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast({ title: t("notes.linkCopyFailed"), variant: "destructive" });
    }
  };

  const allowedEditOptions = allowedEditPermissions[visibility];
  const isDirty = visibility !== note.visibility || editPermission !== note.editPermission;
  const canEdit = canManage;

  return (
    <div className="space-y-6">
      <section className="border-border/60 space-y-3 rounded-lg border p-4">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">{t("notes.shareVisibilityHeading")}</h2>
          <p className="text-muted-foreground text-xs">{t("notes.visibilitySectionDescription")}</p>
        </header>
        <RadioGroup
          value={visibility}
          onValueChange={(value) => {
            if (!canEdit) return;
            const next = value as NoteVisibility;
            setVisibility(next);
            const allowed = allowedEditPermissions[next];
            if (!allowed.includes(editPermission)) {
              setEditPermission(allowed[0]);
            }
          }}
          className="gap-3"
          aria-label={t("notes.shareVisibilityHeading")}
        >
          {VISIBILITY_ORDER.map((value) => (
            <VisibilityOptionRow
              key={value}
              value={value}
              selectedVisibility={visibility}
              canEdit={canEdit}
              noteUrl={noteUrl}
              onCopyNoteUrl={handleCopyNoteUrl}
            />
          ))}
        </RadioGroup>
      </section>

      <section className="border-border/60 space-y-3 rounded-lg border p-4">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">{t("notes.shareEditPermissionHeading")}</h2>
        </header>
        <RadioGroup
          value={editPermission}
          onValueChange={(value) => {
            if (!canEdit) return;
            setEditPermission(value as NoteEditPermission);
          }}
          className="gap-3"
          aria-label={t("notes.shareEditPermissionHeading")}
        >
          {EDIT_PERMISSION_ORDER.map((value) => (
            <EditPermissionOptionRow
              key={value}
              value={value}
              allowedEditOptions={allowedEditOptions}
              canEdit={canEdit}
            />
          ))}
        </RadioGroup>
      </section>

      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={handleSaveNote} disabled={isSaving || !isDirty}>
            {isSaving ? t("common.saving") : t("notes.shareSaveChanges")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs" role="note">
          {t("notes.shareReadOnlyNotice")}
        </p>
      )}

      <DefaultNotePublicWarningDialog
        open={defaultNoteWarningOpen}
        onOpenChange={setDefaultNoteWarningOpen}
        onConfirm={handleConfirmDefaultNoteWarning}
        isSaving={isSaving}
      />
      <PublicAnyLoggedInSaveAlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmPublicAnyLoggedInSave}
        isSaving={isSaving}
      />
    </div>
  );
};

export default VisibilitySection;
