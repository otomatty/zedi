/**
 * `/index` — Wiki Index viewer page (P4, otomatty/zedi#598).
 *
 * Displays the user's auto-generated `__index__` special page as a
 * read-only category table-of-contents. The mount path only reads the
 * current state (GET), so merely viewing the page does not pollute
 * `activity_log`; the explicit "Rebuild" button triggers POST, which
 * writes the page and records an `index_build` activity entry.
 *
 * ユーザーの `__index__` 特殊ページ（自動生成のカテゴリ目次）を閲覧する
 * 読み取り専用ページ。初回マウント時は GET のみを呼び、activity_log を
 * 汚染しない。手動再構築ボタン押下でのみ POST を発行する。
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button, useToast } from "@zedi/ui";
import Container from "@/components/layout/Container";

/**
 * Read-only response from GET /api/activity/index.
 * GET /api/activity/index のレスポンス。
 */
interface IndexFetchResponse {
  pageId: string | null;
  lastBuiltAt: string | null;
  totalPages: number;
  categories: Array<{ label: string; count: number }>;
}

/**
 * Rebuild response from POST /api/activity/index/rebuild.
 * POST /api/activity/index/rebuild のレスポンス。
 */
interface IndexRebuildResponse {
  pageId: string;
  created: boolean;
  totalPages: number;
  categories: Array<{ label: string; count: number }>;
  generatedAt: string;
}

/**
 * Normalized view model that unifies GET and POST responses for rendering.
 * GET / POST 双方を同じ UI で扱うための正規化ビューモデル。
 */
interface IndexViewModel {
  pageId: string | null;
  totalPages: number;
  categories: Array<{ label: string; count: number }>;
  /** ISO-8601 — `lastBuiltAt` from GET or `generatedAt` from POST. / 表示用時刻。 */
  timestamp: string | null;
}

function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
}

/**
 * GET /api/activity/index — read-only fetch. No DB write, no activity entry.
 * 読み取り専用の取得 API 呼び出し。
 */
async function fetchIndex(): Promise<IndexFetchResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/activity/index`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: HTTP ${res.status}`);
  }
  return res.json() as Promise<IndexFetchResponse>;
}

/**
 * POST /api/activity/index/rebuild — triggers a rebuild and writes activity.
 * `__index__` ページを再構築する API 呼び出し。
 */
async function rebuildIndex(): Promise<IndexRebuildResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/activity/index/rebuild`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Rebuild failed: HTTP ${res.status}`);
  }
  return res.json() as Promise<IndexRebuildResponse>;
}

/**
 * Index viewer. Initial mount hits GET for a read-only summary; the Rebuild
 * button hits POST to write the `__index__` page and log an activity entry.
 *
 * インデックス閲覧ページ。マウント時は GET、再構築ボタン押下で POST。
 */
const IndexPage: React.FC = () => {
  const { toast } = useToast();
  const [data, setData] = useState<IndexViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIndex();
      setData({
        pageId: result.pageId,
        totalPages: result.totalPages,
        categories: result.categories,
        timestamp: result.lastBuiltAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    setError(null);
    try {
      const result = await rebuildIndex();
      setData({
        pageId: result.pageId,
        totalPages: result.totalPages,
        categories: result.categories,
        timestamp: result.generatedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast({ title: "Index の再構築に失敗しました", variant: "destructive" });
    } finally {
      setRebuilding(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = loading || rebuilding;

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link to="/home" aria-label="Back to home">
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </Link>
            </Button>
            <h1 className="truncate text-xl font-semibold">Wiki Index / カテゴリ目次</h1>
          </div>
          <Button onClick={() => void rebuild()} disabled={busy} size="sm">
            {rebuilding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            再構築 / Rebuild
          </Button>
        </Container>
      </header>

      <main className="py-6">
        <Container>
          <div className="mx-auto max-w-2xl space-y-6">
            <p className="text-muted-foreground text-sm">
              AI が生成するカテゴリ別目次（Karpathy LLM Wiki の
              <code className="mx-1">index.md</code>
              相当）。ページを追加・更新したあとに再構築するとカテゴリが更新されます。
            </p>

            {error && (
              <div className="rounded bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>
            )}

            {loading && !data && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            )}

            {data && (
              <>
                <div className="bg-muted/40 rounded border px-4 py-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">対象ページ数:</span>{" "}
                    <span className="font-semibold">{data.totalPages}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">カテゴリ数:</span>{" "}
                    <span className="font-semibold">{data.categories.length}</span>
                  </div>
                  {data.timestamp ? (
                    <div className="text-muted-foreground mt-1 text-xs">
                      Last built at {new Date(data.timestamp).toLocaleString()}
                    </div>
                  ) : (
                    <div className="text-muted-foreground mt-1 text-xs">
                      まだ再構築されていません / Not built yet
                    </div>
                  )}
                  {data.pageId && (
                    <div className="mt-2">
                      <Link
                        to={`/page/${data.pageId}`}
                        className="text-primary text-sm underline underline-offset-2"
                      >
                        __index__ ページを開く / Open __index__ page
                      </Link>
                    </div>
                  )}
                </div>

                {data.categories.length === 0 ? (
                  <p className="text-muted-foreground">まだページがありません。 / No pages yet.</p>
                ) : (
                  <ul className="divide-border divide-y rounded border">
                    {data.categories.map((cat) => (
                      <li
                        key={cat.label}
                        className="flex items-center justify-between px-4 py-2 text-sm"
                      >
                        <span className="font-medium">{cat.label}</span>
                        <span className="text-muted-foreground">{cat.count} ページ</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </Container>
      </main>
    </div>
  );
};

export default IndexPage;
