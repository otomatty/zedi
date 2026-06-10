/**
 * `fetch_article` tool — fetches and Readability-extracts a URL into a
 * preview-sized excerpt.
 *
 * LangGraph tool wrapping {@link extractArticleFromUrl}. SSRF-guarded with the
 * same `isClipUrlAllowedAfterDns` check that `/api/clip` and `clipServerFetch`
 * use. Returns a JSON-stringified envelope `{ ok, ...fields | error }`. Errors
 * (block, fetch timeout, parse failure) never throw — the caller node maps
 * `ok:false` to a removed source so a single bad URL does not abort the
 * research iteration.
 *
 * `extractArticleFromUrl` を tool 化した版。SSRF 防御は `clipUrlPolicy` の
 * `isClipUrlAllowedAfterDns` を流用する。失敗時は `{ ok:false, error }` を
 * JSON 文字列で返す（throw しない）ことで、調査ループの 1 イテレーションが
 * 1 件の URL 不調で停止しないようにする。
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { extractArticleFromUrl, ClipFetchBlockedError } from "../../../services/articleExtractor.js";
import { isClipUrlAllowedAfterDns } from "../../../lib/clipUrlPolicy.js";

/** Tool name. */
export const FETCH_ARTICLE_TOOL_NAME = "fetch_article" as const;

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
 * 成功時 JSON 包絡型。失敗時は `{ ok:false, error }` で返す。
 *
 * Success envelope; failure shape is `{ ok:false, error }`. The caller node
 * always `JSON.parse`s and branches on `ok`.
 */
interface FetchArticleSuccess {
  ok: true;
  url: string;
  finalUrl: string;
  title: string;
  excerpt: string;
  contentHash: string;
  thumbnailUrl: string | null;
}

interface FetchArticleFailure {
  ok: false;
  url: string;
  error: string;
}

export const fetchArticleTool = tool(
  async (input) => {
    const url = input.url;
    const previewLength = input.previewLength ?? 4000;
    if (!(await isClipUrlAllowedAfterDns(url))) {
      const fail: FetchArticleFailure = { ok: false, url, error: "url_blocked" };
      return JSON.stringify(fail);
    }
    try {
      const article = await extractArticleFromUrl({ url, previewLength });
      const ok: FetchArticleSuccess = {
        ok: true,
        url,
        finalUrl: article.finalUrl,
        title: article.title,
        excerpt: article.contentText,
        contentHash: article.contentHash,
        thumbnailUrl: article.thumbnailUrl,
      };
      return JSON.stringify(ok);
    } catch (err) {
      const error =
        err instanceof ClipFetchBlockedError
          ? "url_blocked"
          : err instanceof Error
            ? err.message
            : String(err);
      const fail: FetchArticleFailure = { ok: false, url, error };
      return JSON.stringify(fail);
    }
  },
  {
    name: FETCH_ARTICLE_TOOL_NAME,
    description:
      "Fetch and extract the main article body from a URL. Returns title, content, and source metadata. " +
      "URL から本文を抽出し、タイトル・本文・メタ情報を返す。",
    schema: fetchArticleInputSchema,
  },
);
