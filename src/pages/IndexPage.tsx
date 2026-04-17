/**
 * `/index` — Wiki Index viewer page (P4, otomatty/zedi#598).
 *
 * Displays the user's auto-generated `__index__` special page as a
 * read-only category table-of-contents, with a manual "Rebuild" button.
 *
 * ユーザーの `__index__` 特殊ページ（自動生成のカテゴリ目次）を閲覧する
 * 読み取り専用ページ。手動再構築ボタン付き。
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button, useToast } from "@zedi/ui";
import Container from "@/components/layout/Container";

interface RebuildIndexResponse {
  pageId: string;
  created: boolean;
  totalPages: number;
  categories: Array<{ label: string; count: number }>;
  generatedAt: string;
}

function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
}

/**
 * Triggers POST /api/activity/index/rebuild.
 * `__index__` ページを再構築する API 呼び出し。
 */
async function rebuildIndex(): Promise<RebuildIndexResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/activity/index/rebuild`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Rebuild failed: HTTP ${res.status}`);
  }
  return res.json() as Promise<RebuildIndexResponse>;
}

/**
 * Index viewer. Shows the latest category summary after rebuilding; does not
 * fetch the markdown body directly (users can open the `__index__` page via
 * the link once they know its ID).
 *
 * インデックス閲覧ページ。再構築後にカテゴリ概要を表示する。Markdown 本文は
 * 通常の `/page/:id` 経路で閲覧する。
 */
const IndexPage: React.FC = () => {
  const { toast } = useToast();
  const [data, setData] = useState<RebuildIndexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await rebuildIndex();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast({ title: "Index の再構築に失敗しました", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void run();
  }, [run]);

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
          <Button onClick={() => void run()} disabled={loading} size="sm">
            {loading ? (
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
                  <div className="text-muted-foreground mt-1 text-xs">
                    Generated at {new Date(data.generatedAt).toLocaleString()}
                  </div>
                  <div className="mt-2">
                    <Link
                      to={`/page/${data.pageId}`}
                      className="text-primary text-sm underline underline-offset-2"
                    >
                      __index__ ページを開く / Open __index__ page
                    </Link>
                  </div>
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
