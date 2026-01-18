import type { Env } from "../../types/env";
import type { ImageSearchResponse } from "../../types/api";
import { searchOpenverse } from "./openverse";
import { searchWikipedia } from "./wikipedia";
import { searchWikimedia } from "./wikimedia";

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
  const page = Math.max(1, cursor);
  const wikipediaItems =
    page === 1
      ? await searchWikipedia(query, env.WIKIPEDIA_API_URL, env.WIKIPEDIA_REST_URL)
      : [];
  const remainingLimit = Math.max(0, limit - wikipediaItems.length);
  const primaryLimit = Math.ceil(remainingLimit / 2);
  const secondaryLimit = Math.max(0, remainingLimit - primaryLimit);

  const [wikimedia, openverse] = await Promise.all([
    primaryLimit > 0
      ? searchWikimedia(
          query,
          (page - 1) * primaryLimit,
          primaryLimit,
          env.WIKIMEDIA_API_URL
        )
      : Promise.resolve([]),
    secondaryLimit > 0
      ? searchOpenverse(
          query,
          page,
          secondaryLimit,
          env.OPENVERSE_API_URL
        )
      : Promise.resolve([]),
  ]);

  const items = [...wikipediaItems, ...wikimedia, ...openverse];
  const uniqueItems = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);
    uniqueItems.push(item);
    if (uniqueItems.length >= limit) break;
  }
  const nextCursor = uniqueItems.length === 0 ? undefined : String(page + 1);

  return { items: uniqueItems, nextCursor };
}
