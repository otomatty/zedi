import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Label, Textarea } from "@zedi/ui";
import type { UserAdmin } from "@/api/admin";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";

interface SuspendDialogProps {
  /** サスペンド対象のユーザー（null で非表示）/ User to suspend (null to hide) */
  user: UserAdmin | null;
  /** ダイアログを閉じるコールバック / Close callback */
  onClose: () => void;
  /** サスペンド確定コールバック / Confirm suspension callback */
  onConfirm: (user: UserAdmin, reason?: string) => void;
}

/**
 * ユーザーサスペンド時の理由入力ダイアログ。
 * Dialog for entering suspension reason before suspending a user.
 */
export function SuspendDialog({ user, onClose, onConfirm }: SuspendDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!user) return;
    onConfirm(user, reason.trim() || undefined);
    setReason("");
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setReason("");
      onClose();
    }
  };

  return (
    <ConfirmActionDialog
      open={user !== null}
      onOpenChange={handleOpenChange}
      title={t("users.suspendDialog.title")}
      description={
        user ? t("users.suspendDialog.description", { name: user.name || user.email }) : ""
      }
      confirmLabel={t("users.suspendDialog.confirm")}
      destructive
      onConfirm={handleConfirm}
    >
      <div className="grid gap-2">
        <Label htmlFor="suspend-reason">{t("users.suspendDialog.reasonLabel")}</Label>
        <Textarea
          id="suspend-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("users.suspendDialog.reasonPlaceholder")}
          rows={3}
        />
      </div>
    </ConfirmActionDialog>
  );
}
