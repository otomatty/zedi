import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle2,
  Ghost,
  Unlink,
  FileQuestion,
  FileText,
  Zap,
} from "lucide-react";
import { Badge, Button, Skeleton } from "@zedi/ui";
import type { ReactNode } from "react";

/**
 * Lint finding の型（API レスポンス）。
 * Lint finding type from API response.
 */
interface LintFindingResponse {
  id: string;
  rule: string;
  severity: string;
  page_ids: string[];
  detail: Record<string, unknown>;
  created_at: string;
}

function getApiBaseUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
  return base.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
}

/**
 * 指定ページに関連する Lint findings を取得する。
 * Fetches lint findings related to a specific page.
 *
 * 認証エラー（401/403）はログイン未済を意味するので空配列を返してカードを
 * 出さない。それ以外のサーバーエラーは throw して React Query の `error` に
 * 流し、UI 側で「失敗 = findings が無い」と誤解されないようにする。
 *
 * 401/403 mean the user is not signed in; return an empty list so the card
 * stays hidden. Any other non-OK response is thrown so React Query surfaces
 * the failure instead of silently rendering an empty state.
 */
async function fetchPageFindings(pageId: string): Promise<LintFindingResponse[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/lint/findings/page/${encodeURIComponent(pageId)}`, {
    credentials: "include",
  });
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message ?? "Failed to fetch lint findings");
  }
  const data = (await res.json()) as { findings: LintFindingResponse[] };
  return data.findings;
}

/**
 * Lint finding を解決済みにマークする。
 * Resolves a lint finding.
 */
async function resolveFinding(findingId: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/lint/findings/${encodeURIComponent(findingId)}/resolve`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message ?? "Failed to resolve finding");
  }
}

/**
 * ルールごとのアイコンを返す。
 * Returns an icon for the given rule.
 */
function ruleIcon(rule: string): ReactNode {
  switch (rule) {
    case "orphan":
      return <FileQuestion className="h-4 w-4" />;
    case "ghost_many":
      return <Ghost className="h-4 w-4" />;
    case "title_similar":
      return <FileText className="h-4 w-4" />;
    case "conflict":
      return <Zap className="h-4 w-4" />;
    case "broken_link":
      return <Unlink className="h-4 w-4" />;
    default:
      return <Info className="h-4 w-4" />;
  }
}

/**
 * ルール名を日本語で表示する。
 * Returns a Japanese label for the given rule.
 */
function ruleLabel(rule: string): string {
  switch (rule) {
    case "orphan":
      return "孤立ページ";
    case "ghost_many":
      return "Ghost Link 過多";
    case "title_similar":
      return "タイトル類似";
    case "conflict":
      return "矛盾";
    case "broken_link":
      return "リンク切れ";
    default:
      return rule;
  }
}

/**
 * 重要度に応じたスタイルアイコンを返す。
 * Returns a styled icon for the given severity.
 */
function severityIcon(severity: string): ReactNode {
  switch (severity) {
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return <Info className="text-muted-foreground h-4 w-4" />;
  }
}

/**
 * detail からサマリ文字列を生成する。
 * Creates a summary string from the detail object.
 */
function formatDetail(detail: Record<string, unknown>): string {
  if (typeof detail.suggestion === "string") return detail.suggestion;
  if (typeof detail.title === "string") return detail.title;
  if (typeof detail.linkText === "string") {
    return `「${detail.linkText}」`;
  }
  if (typeof detail.titleA === "string" && typeof detail.titleB === "string") {
    return `「${detail.titleA}」と「${detail.titleB}」が類似しています`;
  }
  return JSON.stringify(detail);
}

interface LintSuggestionsProps {
  pageId: string;
}

/**
 * ページ下部に表示する Lint Suggestions カード。
 * LinkedPagesSection の近辺で使用する。
 *
 * Lint Suggestions card displayed near the bottom of the page.
 * Used alongside LinkedPagesSection.
 *
 * @param pageId - 対象ページ ID / Target page ID
 */
export function LintSuggestions({ pageId }: LintSuggestionsProps) {
  const queryClient = useQueryClient();

  const {
    data: findings,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lintFindings", pageId],
    queryFn: () => fetchPageFindings(pageId),
    staleTime: 1000 * 60, // 1 minute
  });

  const resolveMutation = useMutation({
    mutationFn: resolveFinding,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lintFindings", pageId] });
    },
  });

  if (isLoading) {
    return (
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // findings 取得失敗を空状態と区別して表示する。空にしてしまうと「指摘なし」
  // に見えてしまうので、明示的にエラーメッセージと再試行ボタンを出す。
  // Surface API failures explicitly so an error is not mistaken for "no
  // findings" (the previous behaviour collapsed silently to null).
  if (isError) {
    return (
      <div className="mt-6 space-y-3 border-t pt-6">
        <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span>Suggestions の取得に失敗しました</span>
        </div>
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          再試行
        </Button>
      </div>
    );
  }

  if (!findings || findings.length === 0) return null;

  return (
    <div className="mt-6 space-y-3 border-t pt-6">
      <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4" />
        <span>Suggestions ({findings.length})</span>
      </div>
      <div className="space-y-2">
        {findings.map((f) => (
          <div key={f.id} className="bg-muted/50 flex items-start gap-3 rounded-lg border p-3">
            <div className="mt-0.5 shrink-0">{severityIcon(f.severity)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {ruleIcon(f.rule)}
                <Badge variant="outline" className="text-xs">
                  {ruleLabel(f.rule)}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">{formatDetail(f.detail)}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => resolveMutation.mutate(f.id)}
              disabled={resolveMutation.isPending}
              aria-label="この Suggestion を解決済みにする / Mark suggestion as resolved"
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
