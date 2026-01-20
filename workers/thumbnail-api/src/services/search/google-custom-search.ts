import type { ImageSearchItem } from "../../types/api";

const DEFAULT_GOOGLE_CUSTOM_SEARCH_API = "https://www.googleapis.com/customsearch/v1";

interface GoogleCustomSearchImage {
  contextLink?: string;
  height?: number;
  width?: number;
  thumbnailLink?: string;
  thumbnailHeight?: number;
  thumbnailWidth?: number;
}

interface GoogleCustomSearchItem {
  title?: string;
  link?: string;
  displayLink?: string;
  mime?: string;
  image?: GoogleCustomSearchImage;
}

interface GoogleCustomSearchResponse {
  items?: GoogleCustomSearchItem[];
  searchInformation?: {
    totalResults?: string;
  };
}

export async function searchGoogleCustomSearch(
  query: string,
  apiKey: string,
  searchEngineId: string,
  page: number = 1,
  limit: number = 10
): Promise<ImageSearchItem[]> {
  if (!query || !apiKey || !searchEngineId) return [];

  // Google Custom Search APIの制限: numは最大10
  const num = Math.min(Math.max(limit, 1), 10);
  // startは1ベース（1, 11, 21, ...）
  const start = (page - 1) * num + 1;

  // 最大100件まで取得可能
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

  const response = await fetch(
    `${DEFAULT_GOOGLE_CUSTOM_SEARCH_API}?${params.toString()}`,
    {
      headers: {
        "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Google Custom Search request failed: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as GoogleCustomSearchResponse;
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
