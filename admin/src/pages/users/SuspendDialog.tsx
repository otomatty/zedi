import { useState } from "react";
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
      title="ユーザーをサスペンド"
      description={
        user
          ? `${user.name || user.email} をサスペンドします。サスペンドされたユーザーはすべての API にアクセスできなくなり、既存セッションも無効化されます。`
          : ""
      }
      confirmLabel="サスペンド"
      destructive
      onConfirm={handleConfirm}
    >
      <div className="grid gap-2">
        <Label htmlFor="suspend-reason">理由（任意）</Label>
        <Textarea
          id="suspend-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="サスペンドの理由を入力してください"
          rows={3}
        />
      </div>
    </ConfirmActionDialog>
  );
}
