import { Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Label, RadioGroup, RadioGroupItem, useToast } from "@zedi/ui";
import type { Note, NoteEditPermission, NoteVisibility } from "@/types/note";
import { allowedEditPermissions, visibilityKeys } from "@/lib/noteSettingsConfig";
import { PublicAnyLoggedInSaveAlertDialog } from "@/pages/NoteSettings/PublicAnyLoggedInSaveAlertDialog";
import { useNoteSettingsSaveWithPublicConfirm } from "@/pages/NoteSettings/useNoteSettingsSaveWithPublicConfirm";

/**
 * 公開設定タブの i18n 説明文キー。
 * i18n keys for the visibility description under each radio option.
 */
const visibilityDescriptionKeys: Record<NoteVisibility, string> = {
  private: "notes.shareVisibilityDescriptionPrivate",
  unlisted: "notes.shareVisibilityDescriptionUnlisted",
  public: "notes.shareVisibilityDescriptionPublic",
  restricted: "notes.shareVisibilityDescriptionRestricted",
};

/**
 * 編集権限タブの i18n ラベル・説明文キー。
 * i18n keys for the edit-permission radio labels and descriptions.
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

/**
 * 公開設定タブの Props。
 * Props for the visibility tab.
 */
export interface ShareModalVisibilityTabProps {
  note: Note;
  canEdit: boolean;
}

/**
 * 公開設定タブの内部 Props。
 * Props for the inner rendering component (state injected from the parent).
 */
interface VisibilityTabViewProps extends ShareModalVisibilityTabProps {
  visibility: NoteVisibility;
  setVisibility: (v: NoteVisibility) => void;
  editPermission: NoteEditPermission;
  setEditPermission: (v: NoteEditPermission) => void;
  noteUrl: string;
  onCopyNoteUrl: () => void;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
}

/**
 * 公開設定 radio 1 行分の描画。
 * Renders one visibility option row (radio + label + description, plus share URL block for unlisted).
 */
function VisibilityOptionRow({
  value,
  selectedVisibility,
  canEdit,
  noteUrl,
  onCopyNoteUrl,
}: {
  value: NoteVisibility;
  selectedVisibility: NoteVisibility;
  canEdit: boolean;
  noteUrl: string;
  onCopyNoteUrl: () => void;
}) {
  const { t } = useTranslation();
  const inputId = `share-visibility-${value}`;
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

/**
 * 編集権限 radio 1 行分の描画。
 * Renders one edit-permission option row (radio + label + description).
 */
function EditPermissionOptionRow({
  value,
  allowedEditOptions,
  canEdit,
}: {
  value: NoteEditPermission;
  allowedEditOptions: readonly NoteEditPermission[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const inputId = `share-edit-permission-${value}`;
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
 * 公開設定タブの内部描画（状態はロジック側から受け取る）。
 * Inner rendering — receives state from the logic layer so the outer component
 * can stay thin and testable.
 */
function VisibilityTabView({
  visibility,
  setVisibility,
  editPermission,
  setEditPermission,
  canEdit,
  noteUrl,
  onCopyNoteUrl,
  onSave,
  isSaving,
  isDirty,
}: VisibilityTabViewProps) {
  const { t } = useTranslation();
  const allowedEditOptions = allowedEditPermissions[visibility];
  return (
    <div className="space-y-6 pt-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("notes.shareVisibilityHeading")}</h3>
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
              onCopyNoteUrl={onCopyNoteUrl}
            />
          ))}
        </RadioGroup>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("notes.shareEditPermissionHeading")}</h3>
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
          <Button onClick={onSave} disabled={isSaving || !isDirty}>
            {isSaving ? t("common.saving") : t("notes.shareSaveChanges")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs" role="note">
          {t("notes.shareReadOnlyNotice")}
        </p>
      )}
    </div>
  );
}

/**
 * 公開設定タブ。visibility と editPermission を変更し、unlisted のときは共有 URL を表示する。
 * Visibility tab — lets the owner change visibility + edit permission. When
 * `unlisted` is selected the share URL copy control is rendered inline so users
 * can distinguish it from share-link invitations.
 */
export function ShareModalVisibilityTab({ note, canEdit }: ShareModalVisibilityTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [visibility, setVisibility] = useState<NoteVisibility>(note.visibility);
  const [editPermission, setEditPermission] = useState<NoteEditPermission>(note.editPermission);

  useEffect(() => {
    // Sync form state if the underlying note changes (e.g. after save + refetch).
    // ノートが再取得されたらフォーム状態を同期する。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init from loaded note
    setVisibility(note.visibility);
    setEditPermission(note.editPermission);
  }, [note.visibility, note.editPermission]);

  const {
    handleSaveNote,
    confirmOpen,
    setConfirmOpen,
    handleConfirmPublicAnyLoggedInSave,
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

  const isDirty = visibility !== note.visibility || editPermission !== note.editPermission;

  return (
    <>
      <VisibilityTabView
        note={note}
        canEdit={canEdit}
        visibility={visibility}
        setVisibility={setVisibility}
        editPermission={editPermission}
        setEditPermission={setEditPermission}
        noteUrl={noteUrl}
        onCopyNoteUrl={handleCopyNoteUrl}
        onSave={handleSaveNote}
        isSaving={isSaving}
        isDirty={isDirty}
      />
      <PublicAnyLoggedInSaveAlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmPublicAnyLoggedInSave}
        isSaving={isSaving}
      />
    </>
  );
}
