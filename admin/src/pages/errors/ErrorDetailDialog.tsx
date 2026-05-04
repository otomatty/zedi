import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@zedi/ui";
import type { ApiErrorRow, ApiErrorStatus } from "@/api/admin";
import { formatDate, formatNumber } from "@/lib/dateUtils";

const STATUS_VALUES: ApiErrorStatus[] = ["open", "investigating", "resolved", "ignored"];

interface ErrorDetailDialogProps {
  row: ApiErrorRow | null;
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onUpdateStatus: (id: string, next: ApiErrorStatus) => Promise<void>;
}

/**
 * 単一の API エラー詳細ダイアログ。AI 解析結果（要約・推定原因・関連ファイル）を
 * 表示しつつ、`PATCH /api/admin/errors/:id` でステータスを更新できる。
 *
 * Detail dialog for a single API error. Shows AI analysis output (summary,
 * suspected files, root cause) and lets the admin update the workflow status
 * via `PATCH /api/admin/errors/:id`.
 *
 * @see https://github.com/otomatty/zedi/issues/804
 */
export function ErrorDetailDialog({
  row,
  saving,
  saveError,
  onClose,
  onUpdateStatus,
}: ErrorDetailDialogProps) {
  const { t } = useTranslation();
  // 「現在開いている行」をキーに「未保存の status 選択」を持つ。row.id をキーに
  // 含めることで、別行に切り替わった瞬間に `pendingStatus` を破棄でき、
  // useEffect での setState（cascading render の原因）を不要にできる。
  //
  // Track unsaved status by the currently-open row id; switching rows
  // automatically discards the prior selection without an effect that would
  // trigger a cascading render.
  const [pendingFor, setPendingFor] = useState<{ id: string; status: ApiErrorStatus } | null>(null);
  const pendingStatus = pendingFor && row && pendingFor.id === row.id ? pendingFor.status : null;
  const setPendingStatus = (next: ApiErrorStatus) => {
    if (!row) return;
    setPendingFor({ id: row.id, status: next });
  };

  if (!row) return null;

  const effectiveStatus: ApiErrorStatus = pendingStatus ?? row.status;
  const dirty = pendingStatus !== null && pendingStatus !== row.status;

  const handleSave = async () => {
    if (!pendingStatus || pendingStatus === row.status) return;
    await onUpdateStatus(row.id, pendingStatus);
  };

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-all">{row.title}</DialogTitle>
          <DialogDescription>
            {row.route ? `${row.route} · ` : ""}
            {t("errors.detail.occurrencesShort", { count: formatNumber(row.occurrences) })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-muted-foreground text-xs">{t("errors.detail.firstSeen")}</dt>
              <dd>{formatDate(row.firstSeenAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t("errors.detail.lastSeen")}</dt>
              <dd>{formatDate(row.lastSeenAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t("errors.detail.severity")}</dt>
              <dd>
                <Badge variant="outline">{t(`errors.severity.${row.severity}`)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t("errors.detail.statusCode")}</dt>
              <dd>{row.statusCode ?? "—"}</dd>
            </div>
          </dl>

          {row.aiSummary && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                {t("errors.detail.aiSummary")}
              </h3>
              <p className="mt-1 whitespace-pre-wrap">{row.aiSummary}</p>
            </section>
          )}

          {row.aiRootCause && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                {t("errors.detail.aiRootCause")}
              </h3>
              <p className="mt-1 whitespace-pre-wrap">{row.aiRootCause}</p>
            </section>
          )}

          {row.aiSuggestedFix && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                {t("errors.detail.aiSuggestedFix")}
              </h3>
              <p className="mt-1 whitespace-pre-wrap">{row.aiSuggestedFix}</p>
            </section>
          )}

          {row.aiSuspectedFiles && row.aiSuspectedFiles.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                {t("errors.detail.suspectedFiles")}
              </h3>
              <ul className="text-muted-foreground mt-1 list-inside list-disc space-y-0.5 text-xs">
                {row.aiSuspectedFiles.map((file, idx) => (
                  <li key={`${file.path}-${idx}`}>
                    <code>{file.path}</code>
                    {file.line != null ? `:${file.line}` : ""}
                    {file.reason ? ` — ${file.reason}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {row.githubIssueNumber != null && (
            <p className="text-muted-foreground text-xs">
              {t("errors.detail.githubIssue", { number: row.githubIssueNumber })}
            </p>
          )}

          <section>
            <label
              htmlFor="errors-status-update"
              className="mb-1 block text-xs font-semibold tracking-wide text-slate-400 uppercase"
            >
              {t("errors.detail.statusUpdate")}
            </label>
            <Select
              value={effectiveStatus}
              onValueChange={(v) => setPendingStatus(v as ApiErrorStatus)}
              disabled={saving}
            >
              <SelectTrigger id="errors-status-update" className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`errors.status.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {saveError && (
              <p role="alert" className="mt-2 text-xs text-red-300">
                {saveError}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? t("common.saving") : t("errors.detail.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
