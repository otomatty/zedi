/**
 * `web_search` tool stub for the Wiki Compose research subgraph (#949).
 *
 * Web 検索 tool のスタブ。本実装は #949 (P1 調査 subgraph) で行うが、P0 では
 * LangGraph tool として bind 可能な形と zod スキーマ・名前空間だけ確定させ、
 * 呼び出し時は `WEB_SEARCH_NOT_IMPLEMENTED` を返す。
 *
 * Stub web search tool. P0 only fixes the name + zod schema so subgraphs can
 * `bindTools([webSearchTool])` without breakage; behaviour ships in #949.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/** Tool name shared across subgraphs. 全 subgraph 共通の tool 名。 */
export const WEB_SEARCH_TOOL_NAME = "web_search" as const;

/** Stub response surfaced when the tool is called before #949 lands. */
const STUB_RESPONSE_PREFIX = "WEB_SEARCH_NOT_IMPLEMENTED";

/**
 * Input schema (zod). `query` は必須、`limit` は 1〜10、`recencyDays` は省略可。
 * Input schema; `query` required, `limit` 1..10, `recencyDays` optional.
 */
export const webSearchInputSchema = z.object({
  query: z.string().min(1).describe("Search query string. 検索クエリ。"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Max results (default 5). 最大件数 (既定 5)。"),
  recencyDays: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Restrict to results within N days. N 日以内の結果に限定。"),
});

/**
 * P0 stub. Bound by subgraphs via `model.bindTools([webSearchTool])`. The body
 * intentionally returns a sentinel string so research subgraphs that depend on
 * it surface a visible failure mode rather than silent empty results.
 *
 * P0 スタブ。呼び出されたら sentinel を返し、依存する subgraph が静かに空結果を
 * 受け取るのを防ぐ。
 */
export const webSearchTool = tool(
  async (input) => {
    const summary = `${STUB_RESPONSE_PREFIX} query=${JSON.stringify(input.query)}`;
    return summary;
  },
  {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      "Search the public web for fresh information. Returns top results with title + snippet + url. " +
      "公開 Web を検索し、タイトル・抜粋・URL を返す。",
    schema: webSearchInputSchema,
  },
);
