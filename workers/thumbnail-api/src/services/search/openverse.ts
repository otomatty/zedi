import type { ImageSearchItem } from "../../types/api";

const DEFAULT_OPENVERSE_API = "https://api.openverse.org/v1/images/";

interface OpenverseResult {
  id: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  creator?: string;
  creator_url?: string;
  source?: string;
  foreign_landing_url?: string;
}

export async function searchOpenverse(
  query: string,
  page: number,
  limit: number,
  apiBase: string = DEFAULT_OPENVERSE_API
): Promise<ImageSearchItem[]> {
  if (!query) return [];
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: String(limit),
  });

  const response = await fetch(`${apiBase}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Openverse request failed: ${response.status}`);
  }

  const data = (await response.json()) as { results?: OpenverseResult[] };
  const results = data.results || [];

  return results
    .map((result) => {
      if (!result.url || !result.thumbnail) return null;
      return {
        id: result.id,
        previewUrl: result.thumbnail,
        imageUrl: result.url,
        alt: result.title || query,
        sourceName: result.source || "Openverse",
        sourceUrl: result.foreign_landing_url || result.url,
        authorName: result.creator || undefined,
        authorUrl: result.creator_url || undefined,
      } satisfies ImageSearchItem;
    })
    .filter((item): item is ImageSearchItem => item !== null);
}
