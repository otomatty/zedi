import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * ルール／起点のラベルマップ。
 * Labels for activity kind and actor.
 */
const KIND_LABELS: Record<ActivityKind, string> = {
  clip_ingest: "クリップ取り込み / Clip ingest",
  chat_promote: "Chat → Wiki 昇格 / Chat promote",
  lint_run: "Lint 実行 / Lint run",
  wiki_generate: "Wiki 生成 / Wiki generate",
  index_build: "Index 構築 / Index build",
  wiki_schema_update: "スキーマ更新 / Schema update",
};
const ACTOR_LABELS: Record<ActivityActor, string> = {
  user: "ユーザー / User",
  ai: "AI",
  system: "システム / System",
};

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
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<ActivityKind | undefined>(undefined);
  const [actorFilter, setActorFilter] = useState<ActivityActor | undefined>(undefined);

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (mountedRef.current) setLoading(true);
    if (mountedRef.current) setError(null);
    try {
      const result = await listActivity({ kind: kindFilter, actor: actorFilter, limit: 100 });
      if (!mountedRef.current) return;
      setEntries(result.entries);
      setTotal(result.total);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
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
        <h1 className="text-lg font-semibold">Activity Log / 活動ログ</h1>
        <Button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "読み込み中..." : "再読み込み"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="activity-kind" className="text-muted-foreground mb-1 block text-xs">
            種別 / Kind
          </label>
          <Select value={kindFilter ?? ANY} onValueChange={onKind}>
            <SelectTrigger id="activity-kind" className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="activity-actor" className="text-muted-foreground mb-1 block text-xs">
            起点 / Actor
          </label>
          <Select value={actorFilter ?? ANY} onValueChange={onActor}>
            <SelectTrigger id="activity-actor" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              {ACTORS.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTOR_LABELS[a]}
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
        <p className="text-muted-foreground mt-4">読み込み中...</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground mt-4">活動ログはまだありません。</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table className="border-border min-w-[720px] rounded border">
            <TableHeader>
              <TableRow className="border-border bg-muted/50 hover:bg-transparent">
                <TableHead className="px-3 py-2">種別</TableHead>
                <TableHead className="px-3 py-2">起点</TableHead>
                <TableHead className="px-3 py-2">詳細</TableHead>
                <TableHead className="px-3 py-2">関連ページ</TableHead>
                <TableHead className="px-3 py-2">記録日時</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="border-border align-top">
                  <TableCell className="px-3 py-2">
                    <Badge variant="outline">{KIND_LABELS[entry.kind]}</Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge variant="secondary">{ACTOR_LABELS[entry.actor]}</Badge>
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
            表示 {entries.length} / 合計 {total} 件
          </p>
        </div>
      )}
    </div>
  );
}
