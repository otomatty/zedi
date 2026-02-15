/**
 * Google Custom Search API for image search
 */

import type { ImageSearchItem } from "../types/index.js";

const API_BASE = "https://www.googleapis.com/customsearch/v1";

export async function searchImages(
  query: string,
  apiKey: string,
  searchEngineId: string,
  page: number,
  limit: number
): Promise<ImageSearchItem[]> {
  if (!query || !apiKey || !searchEngineId) return [];

  const num = Math.min(Math.max(limit, 1), 10);
  const start = (page - 1) * num + 1;
  if (start > 100) return [];

  const params = new URLSearchParams({
    key: apiKey,
    cx: searchEngineId,
    q: query,
    searchType: "image",
    num: String(num),
    start: String(start),
    imgSize: "large",
    imgType: "photo",
    safe: "active",
  });

  const response = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: {
      "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Custom Search failed: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      title?: string;
      link?: string;
      displayLink?: string;
      image?: { thumbnailLink?: string; contextLink?: string };
    }>;
  };

  const items = data.items || [];
  return items
    .map((item) => {
      if (!item.link || !item.image) return null;
      const imageUrl = item.link;
      const previewUrl = item.image.thumbnailLink || item.link;
      const sourceUrl = item.image.contextLink || item.link;
      const title = item.title || query;
      const displayLink = item.displayLink || new URL(imageUrl).hostname;
      return {
        id: imageUrl,
        previewUrl,
        imageUrl,
        alt: title,
        sourceName: displayLink,
        sourceUrl,
      } satisfies ImageSearchItem;
    })
    .filter((item): item is ImageSearchItem => item !== null);
}
