import { useCallback, useState } from "react";
import type { ApiErrorRow, ApiErrorSeverity, ApiErrorStatus } from "@/api/admin";
import { patchApiErrorStatus } from "@/api/admin";
import { ErrorsContent } from "./ErrorsContent";
import { ErrorDetailDialog } from "./ErrorDetailDialog";
import { useApiErrors } from "./useApiErrors";

const PAGE_SIZE = 50;

/**
 * 管理画面「エラー一覧」のコンテナ。`useApiErrors` でポーリング取得しつつ、
 * 詳細ダイアログ・ステータス更新を組み合わせる。
 *
 * Container for the admin errors page. Pulls list data with `useApiErrors`
 * (Phase 1 polling) and orchestrates the detail dialog + status mutations.
 *
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/804
 */
export default function Errors() {
  const [statusFilter, setStatusFilter] = useState<ApiErrorStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<ApiErrorSeverity | "all">("all");
  const [selected, setSelected] = useState<ApiErrorRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { errors, total, loading, error, refetch } = useApiErrors({
    status: statusFilter === "all" ? undefined : statusFilter,
    severity: severityFilter === "all" ? undefined : severityFilter,
    limit: PAGE_SIZE,
  });

  const handleSelect = useCallback((row: ApiErrorRow) => {
    setSelected(row);
    setSaveError(null);
  }, []);

  const handleClose = useCallback(() => {
    setSelected(null);
    setSaveError(null);
  }, []);

  const handleUpdateStatus = useCallback(
    async (id: string, next: ApiErrorStatus) => {
      setSaving(true);
      setSaveError(null);
      try {
        const updated = await patchApiErrorStatus(id, next);
        // 更新後の最新値を即時反映するため、ダイアログ内の選択状態も書き換える。
        // Sync the dialog state with the server's authoritative row.
        setSelected(updated);
        await refetch();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [refetch],
  );

  return (
    <>
      <ErrorsContent
        rows={errors}
        total={total}
        loading={loading}
        error={error}
        statusFilter={statusFilter}
        severityFilter={severityFilter}
        onStatusFilterChange={setStatusFilter}
        onSeverityFilterChange={setSeverityFilter}
        onSelect={handleSelect}
      />
      <ErrorDetailDialog
        row={selected}
        saving={saving}
        saveError={saveError}
        onClose={handleClose}
        onUpdateStatus={handleUpdateStatus}
      />
    </>
  );
}
