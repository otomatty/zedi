/**
 * `wiki_search` tool stub.
 *
 * ユーザー所有 Wiki 内のページ検索 tool。P0 ではスキーマと名前のみ固定し、
 * 中身は #949 (P1 調査 subgraph) で `/api/search` 相当のクエリに置き換える。
 *
 * Searches the executing user's wiki. P0 ships only the schema and name so
 * subgraphs can wire it up; the real implementation lands in #949.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/** Tool name. */
export const WIKI_SEARCH_TOOL_NAME = "wiki_search" as const;

const STUB_RESPONSE_PREFIX = "WIKI_SEARCH_NOT_IMPLEMENTED";

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

/**
 * P0 stub. Authorisation will be enforced by the future implementation: it must
 * filter by the executing user's owner_id pulled from `GraphContext.userId`,
 * not by any tool argument.
 *
 * P0 スタブ。実実装は `GraphContext.userId` から owner_id を取り出して絞り込み
 * する。tool 引数から userId を取らないこと（権限境界）。
 */
export const wikiSearchTool = tool(
  async (input) => {
    const summary = `${STUB_RESPONSE_PREFIX} query=${JSON.stringify(input.query)}`;
    return summary;
  },
  {
    name: WIKI_SEARCH_TOOL_NAME,
    description:
      "Search the executing user's own wiki pages by keyword. Returns matching page ids + titles + excerpts. " +
      "実行ユーザーの Wiki ページを検索し、ID・タイトル・抜粋を返す。",
    schema: wikiSearchInputSchema,
  },
);
