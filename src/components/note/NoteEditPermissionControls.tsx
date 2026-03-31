import { AlertTriangle, HelpCircle } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { NoteEditPermission, NoteVisibility } from "@/types/note";
import { allowedEditPermissions, editPermissionKeys } from "@/lib/noteSettingsConfig";

/**
 * Edit-permission select with help tooltip and warning when `any_logged_in` is selected.
 * 編集権限セレクト、ヘルプツールチップ、`any_logged_in` 時の警告。
 */
export function NoteEditPermissionControls({
  visibility,
  editPermission,
  setEditPermission,
  selectId = "note-edit-permission-select",
}: {
  visibility: NoteVisibility;
  editPermission: NoteEditPermission;
  setEditPermission: (v: NoteEditPermission) => void;
  /** Optional id for the select trigger (e.g. new-note dialog vs settings). */
  selectId?: string;
}) {
  const { t } = useTranslation();
  const showAnyLoggedInWarning = editPermission === "any_logged_in";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={selectId}>{t("notes.editPermission")}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex rounded-sm focus-visible:ring-2 focus-visible:outline-none"
              aria-label={t("notes.editPermissionHelpAria")}
            >
              <HelpCircle className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs space-y-2 text-left" side="top">
            <p className="text-xs">{t("notes.editPermissionHelpOwnerOnly")}</p>
            <p className="text-xs">{t("notes.editPermissionHelpMembersEditors")}</p>
            <p className="text-xs">{t("notes.editPermissionHelpAnyLoggedIn")}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <Select
        value={editPermission}
        onValueChange={(v) => setEditPermission(v as NoteEditPermission)}
      >
        <SelectTrigger id={selectId}>
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
      {showAnyLoggedInWarning ? (
        <Alert variant="destructive" className="mt-1">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>{t("notes.editPermissionAnyLoggedInWarningTitle")}</AlertTitle>
          <AlertDescription>
            {t("notes.editPermissionAnyLoggedInWarningDescription")}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
