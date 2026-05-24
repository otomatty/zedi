/**
 * `fetch_article` tool stub.
 *
 * URL を渡すと Readability ベースで本文を抽出する tool（既存 `extractArticleFromUrl`
 * を将来流用する想定）。P0 ではスキーマだけ確定。
 *
 * Article extractor by URL. Real implementation reuses `extractArticleFromUrl`
 * in `lib/articleExtractor.ts`; P0 only fixes the contract.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/** Tool name. */
export const FETCH_ARTICLE_TOOL_NAME = "fetch_article" as const;

const STUB_RESPONSE_PREFIX = "FETCH_ARTICLE_NOT_IMPLEMENTED";

/**
 * Input schema. URL は http/https のみ。previewLength は 500〜8000。
 * Input schema; URL must be http/https, `previewLength` clamps to 500..8000.
 */
export const fetchArticleInputSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "URL must use http or https")
    .describe("Article URL. 記事 URL。"),
  previewLength: z
    .number()
    .int()
    .min(500)
    .max(8000)
    .optional()
    .describe("Extracted excerpt length (default 4000). 抜粋長 (既定 4000)。"),
});

/**
 * P0 stub. Real implementation routes through `extractArticleFromUrl` with the
 * same SSRF guards (`isAllowedUrlForArticleFetch`) already used by `/api/clip`
 * and `/api/ingest/plan`.
 *
 * P0 スタブ。実装は `extractArticleFromUrl` を経由し、`/api/clip` 等と同じ
 * SSRF 防御 (`isAllowedUrlForArticleFetch`) を通す。
 */
export const fetchArticleTool = tool(
  async (input) => {
    const summary = `${STUB_RESPONSE_PREFIX} url=${JSON.stringify(input.url)}`;
    return summary;
  },
  {
    name: FETCH_ARTICLE_TOOL_NAME,
    description:
      "Fetch and extract the main article body from a URL. Returns title, content, and source metadata. " +
      "URL から本文を抽出し、タイトル・本文・メタ情報を返す。",
    schema: fetchArticleInputSchema,
  },
);
