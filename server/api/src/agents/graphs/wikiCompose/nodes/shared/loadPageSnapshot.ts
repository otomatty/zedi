/**
 * Loads a {@link PageSnapshot} for the Wiki Compose orchestrator graph (#950).
 *
 * `briefDialogue` ノードが session 開始時に 1 度だけ呼ぶ。`pages` / `page_versions`
 * テーブルから現在のタイトル・本文を取得し、Brief 質問生成 / 追記モード判定に
 * 利用できる軽量レコードを返す。失敗時は空タイトル + 空本文の安全な fallback
 * を返す（Brief 自体は無タイトルでも 0 件質問で進めるよう設計してある）。
 *
 * Reads the target page's current title + body so Brief can suggest informed
 * questions and Draft can know whether to append vs replace. Falls back to a
 * zero-content snapshot when the page row cannot be loaded (rare; the route
 * layer already verified view access before invoking the graph).
 */
import { eq } from "drizzle-orm";
import { pages } from "../../../../../schema/pages.js";
import type { Database } from "../../../../../types/index.js";
import type { PageSnapshot } from "../../types.js";

/**
 * Fetch a page snapshot. The function is intentionally narrow — it only reads
 * the fields the orchestrator nodes need, so it doesn't drag the full page
 * accessor service into the agent runtime.
 */
export async function loadPageSnapshot(db: Database, pageId: string): Promise<PageSnapshot> {
  try {
    const [row] = await db
      .select({ id: pages.id, title: pages.title, contentPreview: pages.contentPreview })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!row) return emptySnapshot(pageId);
    // `pages.content_preview` holds the latest persisted markdown-like preview
    // of the body (the live document lives in Hocuspocus). For the orchestrator
    // it's enough to know whether content exists and surface a short excerpt;
    // we don't need the full Yjs binary.
    // `pages.content_preview` は本文のプレビュー文字列を保持している（実体は
    // Hocuspocus）。Brief / Draft の判断には十分なので、ここで読む。
    const body = typeof row.contentPreview === "string" ? row.contentPreview : "";
    return {
      pageId: row.id,
      title: row.title ?? "",
      body,
      hasContent: body.trim().length > 0,
    };
  } catch {
    // Defence in depth: a transient DB error must not crash the whole graph.
    // The Brief node tolerates an empty snapshot (it just asks broader questions).
    return emptySnapshot(pageId);
  }
}

function emptySnapshot(pageId: string): PageSnapshot {
  return { pageId, title: "", body: "", hasContent: false };
}
