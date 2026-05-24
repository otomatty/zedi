/**
 * Tool registry for Wiki Compose subgraphs.
 *
 * 全 subgraph で共有する LangGraph tool 一式。subgraph は本ファイルから tool を
 * import し、`model.bindTools([...])` で束ねて利用する。各 tool の本体は P0 では
 * スタブだが、bind 経路と zod schema は実装と同じ形に固定してある。
 *
 * Aggregate barrel exposing the shared tool set. Subgraphs import individual
 * tools from here and bind them with `bindTools`. P0 ships stubs; the schemas
 * are frozen so swapping in real implementations is non-breaking.
 */
export { WEB_SEARCH_TOOL_NAME, webSearchInputSchema, webSearchTool } from "./webSearch.js";
export { WIKI_SEARCH_TOOL_NAME, wikiSearchInputSchema, wikiSearchTool } from "./wikiSearch.js";
export {
  FETCH_ARTICLE_TOOL_NAME,
  fetchArticleInputSchema,
  fetchArticleTool,
} from "./fetchArticle.js";
export { IMAGE_SEARCH_TOOL_NAME, imageSearchInputSchema, imageSearchTool } from "./imageSearch.js";

import { webSearchTool } from "./webSearch.js";
import { wikiSearchTool } from "./wikiSearch.js";
import { fetchArticleTool } from "./fetchArticle.js";
import { imageSearchTool } from "./imageSearch.js";

/**
 * P0 で共有 tool として bind 可能な配列。subgraph がそのまま `bindTools` に渡せる。
 *
 * Convenience array of all shared tools, ready for `bindTools([...])`.
 */
export const SHARED_TOOLS = [
  webSearchTool,
  wikiSearchTool,
  fetchArticleTool,
  imageSearchTool,
] as const;
