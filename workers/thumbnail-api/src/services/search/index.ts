import type { Env } from "../../types/env";
import type { ImageSearchResponse } from "../../types/api";
import { searchGoogleCustomSearch } from "./google-custom-search";

interface SearchParams {
  query: string;
  cursor: number;
  limit: number;
  env: Env;
}

export async function searchImages({
  query,
  cursor,
  limit,
  env,
}: SearchParams): Promise<ImageSearchResponse> {
  if (!env.GOOGLE_CUSTOM_SEARCH_API_KEY || !env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
    throw new Error(
      "Google Custom Search API key or search engine ID is not configured"
    );
  }

  const page = Math.max(1, cursor);
  const items = await searchGoogleCustomSearch(
    query,
    env.GOOGLE_CUSTOM_SEARCH_API_KEY,
    env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
    page,
    limit
  );

  // 重複排除（URLベース）
  const uniqueItems = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);
    uniqueItems.push(item);
    if (uniqueItems.length >= limit) break;
  }

  // 次のページがあるか判定（Google Custom Search APIは最大100件まで）
  const nextCursor =
    uniqueItems.length === 0 || page * limit >= 100
      ? undefined
      : String(page + 1);

  return { items: uniqueItems, nextCursor };
}
