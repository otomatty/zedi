import type { ImageSearchItem } from "../../types/api";
import { stripHtml } from "../../utils/normalize";

const DEFAULT_WIKIPEDIA_API = "https://ja.wikipedia.org/w/api.php";
const DEFAULT_WIKIPEDIA_REST = "https://ja.wikipedia.org/api/rest_v1";

interface WikipediaSearchResult {
  title: string;
}

interface WikipediaSummary {
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

export async function searchWikipedia(
  query: string,
  apiBase: string = DEFAULT_WIKIPEDIA_API,
  restBase: string = DEFAULT_WIKIPEDIA_REST
): Promise<ImageSearchItem[]> {
  if (!query) return [];

  const searchParams = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srsearch: query,
    srlimit: "1",
    origin: "*",
  });

  const searchResponse = await fetch(`${apiBase}?${searchParams.toString()}`, {
    headers: {
      "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
      Accept: "application/json",
    },
  });

  if (!searchResponse.ok) {
    throw new Error(`Wikipedia search failed: ${searchResponse.status}`);
  }

  const searchData = (await searchResponse.json()) as {
    query?: { search?: WikipediaSearchResult[] };
  };
  const firstResult = searchData.query?.search?.[0];
  if (!firstResult?.title) return [];

  const summaryResponse = await fetch(
    `${restBase}/page/summary/${encodeURIComponent(firstResult.title)}`,
    {
      headers: {
        "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
        Accept: "application/json",
      },
    }
  );

  if (!summaryResponse.ok) {
    throw new Error(`Wikipedia summary failed: ${summaryResponse.status}`);
  }

  const summary = (await summaryResponse.json()) as WikipediaSummary;
  const previewUrl = summary.thumbnail?.source || summary.originalimage?.source;
  const imageUrl = summary.originalimage?.source || summary.thumbnail?.source;
  if (!previewUrl || !imageUrl) return [];

  const pageUrl =
    summary.content_urls?.desktop?.page ||
    `${restBase.replace("/api/rest_v1", "")}/wiki/${encodeURIComponent(
      firstResult.title
    )}`;

  const altText =
    stripHtml(summary.extract) || summary.title || firstResult.title || query;

  return [
    {
      id: `wikipedia:${firstResult.title}`,
      previewUrl,
      imageUrl,
      alt: altText,
      sourceName: "Wikipedia",
      sourceUrl: pageUrl,
    },
  ];
}
