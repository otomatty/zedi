import { useState, useCallback, useRef } from "react";
import type { UserAdmin, UserRole, UserImpact } from "@/api/admin";
import { getUserImpact } from "@/api/admin";

/**
 * ロール変更の確認ダイアログ用ターゲット型。
 * Target type for role change confirmation dialog.
 */
export interface RoleChangeTarget {
  user: UserAdmin;
  newRole: UserRole;
}

/**
 * 削除確認ダイアログ用ターゲット型。
 * Target type for delete confirmation dialog.
 */
export interface DeleteTarget {
  user: UserAdmin;
  impact: UserImpact | null;
  loadingImpact: boolean;
}

/**
 * ロール変更・サスペンド解除・削除の確認ダイアログ状態を管理するフック。
 * Hook that manages confirmation dialog state for role change, unsuspend, and delete actions.
 *
 * @param onRoleChange - ロール変更実行コールバック / Role change callback
 * @param onUnsuspend - サスペンド解除実行コールバック / Unsuspend callback
 * @param onDelete - 削除実行コールバック / Delete callback
 * @returns ダイアログ状態とハンドラ / Dialog state and handlers
 */
export function useConfirmDialogs(
  onRoleChange: (user: UserAdmin, role: UserRole) => void,
  onUnsuspend: (user: UserAdmin) => void,
  onDelete: (user: UserAdmin) => void,
) {
  const [roleChangeTarget, setRoleChangeTarget] = useState<RoleChangeTarget | null>(null);
  const [unsuspendTarget, setUnsuspendTarget] = useState<UserAdmin | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const deleteImpactRequestIdRef = useRef(0);

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

  const requestDelete = useCallback((user: UserAdmin) => {
    const requestId = deleteImpactRequestIdRef.current + 1;
    deleteImpactRequestIdRef.current = requestId;
    setDeleteTarget({ user, impact: null, loadingImpact: true });
    getUserImpact(user.id)
      .then((impact) => {
        setDeleteTarget((prev) =>
          prev && prev.user.id === user.id && deleteImpactRequestIdRef.current === requestId
            ? { ...prev, impact, loadingImpact: false }
            : prev,
        );
      })
      .catch(() => {
        setDeleteTarget((prev) =>
          prev && prev.user.id === user.id && deleteImpactRequestIdRef.current === requestId
            ? { ...prev, loadingImpact: false }
            : prev,
        );
      });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    onDelete(deleteTarget.user);
    setDeleteTarget(null);
  }, [deleteTarget, onDelete]);

  const cancelDelete = useCallback(() => {
    deleteImpactRequestIdRef.current += 1;
    setDeleteTarget(null);
  }, []);

  return {
    roleChangeTarget,
    unsuspendTarget,
    deleteTarget,
    requestRoleChange,
    confirmRoleChange,
    cancelRoleChange,
    requestUnsuspend,
    confirmUnsuspend,
    cancelUnsuspend,
    requestDelete,
    confirmDelete,
    cancelDelete,
  } as const;
}
