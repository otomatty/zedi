import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@zedi/ui";
import {
  listActivity,
  type ActivityActor,
  type ActivityEntry,
  type ActivityKind,
} from "@/api/activity";
import { formatDate } from "@/lib/dateUtils";

const ANY = "__any__";
const KINDS: ActivityKind[] = [
  "clip_ingest",
  "chat_promote",
  "lint_run",
  "wiki_generate",
  "index_build",
  "wiki_schema_update",
];
const ACTORS: ActivityActor[] = ["user", "ai", "system"];

/**
 * detail JSON からサマリ文字列を組み立てる。
 * Builds a human-readable summary from a detail payload.
 */
function formatDetail(entry: ActivityEntry): string {
  const detail = entry.detail ?? {};
  if (entry.kind === "lint_run" && typeof detail.total === "number") {
    return `${detail.total} findings`;
  }
  if (entry.kind === "index_build") {
    const total = typeof detail.totalPages === "number" ? detail.totalPages : "?";
    const cats = typeof detail.categoryCount === "number" ? detail.categoryCount : "?";
    return `${total} pages / ${cats} categories`;
  }
  if (entry.kind === "clip_ingest" || entry.kind === "chat_promote") {
    const title = typeof detail.title === "string" ? detail.title : null;
    const url = typeof detail.url === "string" ? detail.url : null;
    return [title, url].filter(Boolean).join(" — ") || "—";
  }
  if (entry.kind === "wiki_schema_update") {
    const len = typeof detail.contentLength === "number" ? detail.contentLength : "?";
    return `content: ${len} chars`;
  }
  return JSON.stringify(detail);
}

/**
 * 管理画面「活動ログ」ページ。`__index__` 再構築ボタンも備える。
 * Admin Activity Log page.
 */
export default function ActivityLog() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<ActivityKind | undefined>(undefined);
  const [actorFilter, setActorFilter] = useState<ActivityActor | undefined>(undefined);

  const mountedRef = useRef(true);
  // フィルタ切り替え／連打などで複数のリクエストが in-flight になったとき、
  // 古いリクエストが新しいリクエストの後に解決されると stale なテーブル内容で
  // 上書きされる。requestIdRef で発行順を記録し、最新リクエスト以外の結果は
  // 破棄することで out-of-order 上書きを防ぐ。
  // Track in-flight request id so older listActivity responses cannot overwrite
  // newer ones if the user toggles filters or taps reload before the previous
  // request resolves.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (mountedRef.current) setLoading(true);
    if (mountedRef.current) setError(null);
    try {
      const result = await listActivity({ kind: kindFilter, actor: actorFilter, limit: 100 });
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setEntries(result.entries);
      setTotal(result.total);
    } catch (e) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, [kindFilter, actorFilter]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const onKind = (v: string) => setKindFilter(v === ANY ? undefined : (v as ActivityKind));
  const onActor = (v: string) => setActorFilter(v === ANY ? undefined : (v as ActivityActor));

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{t("activityLog.title")}</h1>
        <Button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? t("common.loading") : t("common.reload")}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="activity-kind" className="text-muted-foreground mb-1 block text-xs">
            {t("activityLog.filters.kind")}
          </label>
          <Select value={kindFilter ?? ANY} onValueChange={onKind}>
            <SelectTrigger id="activity-kind" className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`activityLog.kinds.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="activity-actor" className="text-muted-foreground mb-1 block text-xs">
            {t("activityLog.filters.actor")}
          </label>
          <Select value={actorFilter ?? ANY} onValueChange={onActor}>
            <SelectTrigger id="activity-actor" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {ACTORS.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`activityLog.actors.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      {loading && entries.length === 0 ? (
        <p className="text-muted-foreground mt-4">{t("common.loading")}</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground mt-4">{t("activityLog.empty")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table className="border-border min-w-[720px] rounded border">
            <TableHeader>
              <TableRow className="border-border bg-muted/50 hover:bg-transparent">
                <TableHead className="px-3 py-2">{t("activityLog.columns.kind")}</TableHead>
                <TableHead className="px-3 py-2">{t("activityLog.columns.actor")}</TableHead>
                <TableHead className="px-3 py-2">{t("activityLog.columns.detail")}</TableHead>
                <TableHead className="px-3 py-2">{t("activityLog.columns.relatedPages")}</TableHead>
                <TableHead className="px-3 py-2">{t("activityLog.columns.createdAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="border-border align-top">
                  <TableCell className="px-3 py-2">
                    <Badge variant="outline">{t(`activityLog.kinds.${entry.kind}`)}</Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge variant="secondary">{t(`activityLog.actors.${entry.actor}`)}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md px-3 py-2 text-sm break-words">
                    {formatDetail(entry)}
                  </TableCell>
                  <TableCell className="text-muted-foreground px-3 py-2 text-xs">
                    {entry.target_page_ids.length}
                  </TableCell>
                  <TableCell className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                    {formatDate(entry.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-2 text-xs">
            {t("activityLog.showing", { shown: entries.length, total })}
          </p>
        </div>
      )}
    </div>
  );
}
