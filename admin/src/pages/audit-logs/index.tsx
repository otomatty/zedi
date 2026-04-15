import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditLogEntry, GetAuditLogsParams } from "@/api/admin";
import { getAuditLogs } from "@/api/admin";
import { AuditLogsContent, type AuditLogsFilters } from "./AuditLogsContent";

const FILTER_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;
const INITIAL_FILTERS: AuditLogsFilters = {};

/**
 * `datetime-local` の値 (`YYYY-MM-DDTHH:mm`) を API が受け付ける ISO 文字列に変換する。
 * Convert a `datetime-local` value into an ISO string the API accepts.
 */
function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * 管理画面の「監査ログ」ページ。
 * Admin "Audit Logs" page. Fetches from `GET /api/admin/audit-logs`
 * with client-side debounced filter state.
 */
export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<AuditLogsFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditLogsFilters>(INITIAL_FILTERS);

  const isMountedRef = useRef(true);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRequestRef = useRef(0);
  const pageRef = useRef(page);
  const filtersRef = useRef(appliedFilters);
  pageRef.current = page;
  filtersRef.current = appliedFilters;

  const load = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    if (isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);
    try {
      const f = filtersRef.current;
      const params: GetAuditLogsParams = {
        limit: PAGE_SIZE,
        offset: pageRef.current * PAGE_SIZE,
        action: f.action,
        from: toIso(f.from),
        to: toIso(f.to),
      };
      const result = await getAuditLogs(params);
      if (!isMountedRef.current || requestId !== latestRequestRef.current) return;
      setLogs(result.logs);
      setTotal(result.total);
      setError(null);
    } catch (e) {
      if (!isMountedRef.current || requestId !== latestRequestRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isMountedRef.current && requestId === latestRequestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
    };
  }, [load, page, appliedFilters]);

  // フィルター入力のデバウンス
  useEffect(() => {
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => {
      filterTimerRef.current = null;
      setAppliedFilters(filters);
      setPage(0);
    }, FILTER_DEBOUNCE_MS);
    return () => {
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    };
  }, [filters]);

  return (
    <AuditLogsContent
      logs={logs}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      filters={filters}
      onFilterChange={setFilters}
      error={error}
      loading={loading}
      onPageChange={setPage}
    />
  );
}
