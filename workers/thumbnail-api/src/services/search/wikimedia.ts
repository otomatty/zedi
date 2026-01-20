import type { ImageSearchItem } from "../../types/api";
import { stripHtml } from "../../utils/normalize";

const DEFAULT_WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";

interface WikimediaImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}

interface WikimediaPage {
  pageid: number;
  title: string;
  imageinfo?: WikimediaImageInfo[];
}

export async function searchWikimedia(
  query: string,
  offset: number,
  limit: number,
  apiBase: string = DEFAULT_WIKIMEDIA_API
): Promise<ImageSearchItem[]> {
  if (!query) return [];
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: String(limit),
    gsroffset: String(offset),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
  });

  const response = await fetch(`${apiBase}?${params.toString()}`, {
    headers: {
      "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Wikimedia request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    query?: { pages?: Record<string, WikimediaPage> };
  };

  const pages = Object.values(data.query?.pages || {});
  const items: ImageSearchItem[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const previewUrl = info.thumburl || info.url;
    const imageUrl = info.url || info.thumburl;
    if (!previewUrl || !imageUrl) continue;

    const descriptionUrl = info.descriptionurl || imageUrl;
    const artist = stripHtml(info.extmetadata?.Artist?.value);
    const description =
      stripHtml(info.extmetadata?.ObjectName?.value) ||
      stripHtml(info.extmetadata?.ImageDescription?.value);
    const altText = description || page.title || query;

    const candidate: ImageSearchItem = {
      id: String(page.pageid || page.title),
      previewUrl,
      imageUrl,
      alt: altText,
      sourceName: "Wikimedia Commons",
      sourceUrl: descriptionUrl,
    };

    if (artist) {
      candidate.authorName = artist;
      candidate.authorUrl = descriptionUrl;
    }

    items.push(candidate);
  }

  return items;
}
