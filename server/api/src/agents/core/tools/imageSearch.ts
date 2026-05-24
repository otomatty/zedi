/**
 * `image_search` tool stub.
 *
 * Wiki Compose の thumbnail 提案フェーズ向け画像検索 tool。実装は `services/imageSearch.ts`
 * の Google Custom Search 経由に置き換え予定。P0 はスキーマと名前だけ確定する。
 *
 * Image search tool stub. Real implementation will reuse `services/imageSearch.ts`
 * (Google Custom Search). P0 only nails down name + schema.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/** Tool name. */
export const IMAGE_SEARCH_TOOL_NAME = "image_search" as const;

const STUB_RESPONSE_PREFIX = "IMAGE_SEARCH_NOT_IMPLEMENTED";

/**
 * Input schema. `query` 必須、`limit` 1〜10、`page` 1〜10。
 * Input schema.
 */
export const imageSearchInputSchema = z.object({
  query: z.string().min(1).describe("Image search query. 画像検索クエリ。"),
  limit: z.number().int().min(1).max(10).optional().describe("Max results. 最大件数。"),
  page: z.number().int().min(1).max(10).optional().describe("Page number. ページ番号。"),
});

/**
 * P0 stub. Real implementation reads `GOOGLE_CSE_API_KEY` /
 * `GOOGLE_CSE_ENGINE_ID` (matching `services/imageSearch.ts`).
 *
 * P0 スタブ。実装は既存の Google CSE 環境変数を流用する。
 */
export const imageSearchTool = tool(
  async (input) => {
    const summary = `${STUB_RESPONSE_PREFIX} query=${JSON.stringify(input.query)}`;
    return summary;
  },
  {
    name: IMAGE_SEARCH_TOOL_NAME,
    description:
      "Search images for a query and return preview URLs + source attribution. " +
      "画像を検索しプレビュー URL と帰属情報を返す。",
    schema: imageSearchInputSchema,
  },
);
