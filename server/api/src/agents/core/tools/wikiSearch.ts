/**
 * `wiki_search` tool — searches the executing user's own wiki pages by keyword.
 *
 * LangGraph tool wrapping {@link searchUserWikiPages}. Reads `db` / `userId` /
 * `userEmail` from `config.configurable[GRAPH_CONTEXT_CONFIG_KEY]` so the call
 * is implicitly scoped to the caller — never trust `query` for authorisation,
 * trust the runtime context. Returns a JSON string array of `Source`-shaped
 * rows (`kind:"wiki"`); the calling node parses it back.
 *
 * `routes/search.ts` の `scope=shared` 相当ロジック (`wikiSearchService`) を
 * tool 経由で再利用する。ユーザー所有 + 受諾済みメンバー + ドメインルールを
 * 横断する Wiki 検索を、`GraphContext` から取得した `userId` / `userEmail` で
 * 安全に絞り込む。本ファイルは #949 で stub を本実装に差し替えた版。
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  GRAPH_CONTEXT_CONFIG_KEY,
  type GraphContext,
} from "../types/graphContext.js";
import { searchUserWikiPages } from "../../../services/wikiSearchService.js";

/** Tool name. */
export const WIKI_SEARCH_TOOL_NAME = "wiki_search" as const;

/**
 * Input schema. `query` は必須、`limit` は 1〜20。
 * Input schema.
 */
export const wikiSearchInputSchema = z.object({
  query: z.string().min(1).describe("Title / body keyword. タイトル・本文キーワード。"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Max results (default 10). 最大件数 (既定 10)。"),
});

/** Hit shape emitted on the wire (serialised as JSON). */
interface WikiSearchToolHit {
  /** Stable Source id: `wiki:<pageId>`. */
  id: string;
  kind: "wiki";
  title: string;
  pageId: string;
  noteId: string;
  snippet?: string;
}

/**
 * 実装本体。`config.configurable` から graph context を引き、wikiSearchService
 * を呼び出す。tool runtime に context が乗っていない場合（典型的にはユニット
 * テストでの誤呼び出し）は `{ ok:false, error:"missing_graph_context" }` を
 * 返して呼び出し側がそのまま JSON.parse できる形を維持する。
 *
 * Read the `GraphContext` from the runtime config and invoke the service.
 * Returns a JSON-string wrapped envelope so caller nodes can `JSON.parse`
 * unconditionally — including the error branch, so a missing context does
 * not blow up the entire iteration.
 */
export const wikiSearchTool = tool(
  async (input, config?: LangGraphRunnableConfig) => {
    const ctx = readGraphContext(config);
    if (!ctx) {
      return JSON.stringify({ ok: false, error: "missing_graph_context", results: [] });
    }
    const limit = input.limit ?? 10;
    try {
      const hits = await searchUserWikiPages(
        ctx.db,
        ctx.userId,
        ctx.userEmail,
        input.query,
        "shared",
        limit,
      );
      const results: WikiSearchToolHit[] = hits.map((h) => ({
        id: `wiki:${h.pageId}`,
        kind: "wiki",
        title: h.title ?? "(untitled)",
        pageId: h.pageId,
        noteId: h.noteId,
        snippet: h.contentPreview ?? undefined,
      }));
      return JSON.stringify({ ok: true, results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ ok: false, error: message, results: [] });
    }
  },
  {
    name: WIKI_SEARCH_TOOL_NAME,
    description:
      "Search the executing user's own wiki pages by keyword. Returns matching page ids + titles + excerpts. " +
      "実行ユーザーの Wiki ページを検索し、ID・タイトル・抜粋を返す。",
    schema: wikiSearchInputSchema,
  },
);

function readGraphContext(config: LangGraphRunnableConfig | undefined): GraphContext | null {
  const configurable = config?.configurable as Record<string, unknown> | undefined;
  const candidate = configurable?.[GRAPH_CONTEXT_CONFIG_KEY];
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as GraphContext;
}
