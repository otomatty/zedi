import { useState, useCallback } from "react";
import type { UserAdmin, UserRole } from "@/api/admin";

/**
 * ロール変更の確認ダイアログ用ターゲット型。
 * Target type for role change confirmation dialog.
 */
export interface RoleChangeTarget {
  user: UserAdmin;
  newRole: UserRole;
}

/**
 * ロール変更・サスペンド解除の確認ダイアログ状態を管理するフック。
 * Hook that manages confirmation dialog state for role change and unsuspend actions.
 *
 * @param onRoleChange - ロール変更実行コールバック / Role change callback
 * @param onUnsuspend - サスペンド解除実行コールバック / Unsuspend callback
 * @returns ダイアログ状態とハンドラ / Dialog state and handlers
 */
export function useConfirmDialogs(
  onRoleChange: (user: UserAdmin, role: UserRole) => void,
  onUnsuspend: (user: UserAdmin) => void,
) {
  const [roleChangeTarget, setRoleChangeTarget] = useState<RoleChangeTarget | null>(null);
  const [unsuspendTarget, setUnsuspendTarget] = useState<UserAdmin | null>(null);

  const requestRoleChange = useCallback((user: UserAdmin, role: UserRole) => {
    if (user.role === role) return;
    setRoleChangeTarget({ user, newRole: role });
  }, []);

  const confirmRoleChange = useCallback(() => {
    if (!roleChangeTarget) return;
    onRoleChange(roleChangeTarget.user, roleChangeTarget.newRole);
    setRoleChangeTarget(null);
  }, [roleChangeTarget, onRoleChange]);

  const cancelRoleChange = useCallback(() => {
    setRoleChangeTarget(null);
  }, []);

  const requestUnsuspend = useCallback((user: UserAdmin) => {
    setUnsuspendTarget(user);
  }, []);

  const confirmUnsuspend = useCallback(() => {
    if (!unsuspendTarget) return;
    onUnsuspend(unsuspendTarget);
    setUnsuspendTarget(null);
  }, [unsuspendTarget, onUnsuspend]);

  const cancelUnsuspend = useCallback(() => {
    setUnsuspendTarget(null);
  }, []);

  return {
    roleChangeTarget,
    unsuspendTarget,
    requestRoleChange,
    confirmRoleChange,
    cancelRoleChange,
    requestUnsuspend,
    confirmUnsuspend,
    cancelUnsuspend,
  } as const;
}
