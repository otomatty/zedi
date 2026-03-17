/**
 * Web ページの HTML 取得・OGP 抽出・Readability による本文抽出。
 * Fetches HTML, extracts OGP, and extracts main content via Readability.
 */
import { Readability } from "@mozilla/readability";
import type { ClippedContent, OGPData } from "./types";
import { isValidUrl } from "./urlPolicy";
import { sanitizeHtml } from "./sanitizeHtml";

const CORS_PROXIES = ["https://api.allorigins.win/raw?url=", "https://corsproxy.io/?"];

async function fetchWithProxy(url: string): Promise<string> {
  let lastError: Error | null = null;
  for (const proxy of CORS_PROXIES) {
    try {
      const response = await fetch(proxy + encodeURIComponent(url), {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Proxy ${proxy} failed:`, error);
      continue;
    }
  }
  throw lastError || new Error("すべてのプロキシでページの取得に失敗しました");
}

function resolveUrl(base: string, relative: string | null): string | null {
  if (!relative) return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * HTML から OGP 情報を抽出する。
 * Extracts OGP data from HTML document.
 */
export function extractOGPData(doc: Document): OGPData {
  const getMetaContent = (property: string): string | null => {
    const meta =
      doc.querySelector(`meta[property="${property}"]`) ||
      doc.querySelector(`meta[name="${property}"]`);
    return meta?.getAttribute("content") || null;
  };
  return {
    title: getMetaContent("og:title"),
    description: getMetaContent("og:description") || getMetaContent("description"),
    image: getMetaContent("og:image"),
    siteName: getMetaContent("og:site_name"),
  };
}

/**
 * Web ページをクリップしてコンテンツを抽出する。
 * Clips a web page and extracts main content.
 * @param url - 取得する URL / URL to fetch
 * @param fetchHtmlFn - 未指定時は CORS プロキシを使用。指定時はその関数で HTML を取得。
 */
export async function clipWebPage(
  url: string,
  fetchHtmlFn?: (url: string) => Promise<string>,
): Promise<ClippedContent> {
  if (!isValidUrl(url)) {
    throw new Error("有効なURLを入力してください");
  }

  let html: string;
  if (fetchHtmlFn) {
    html = await fetchHtmlFn(url);
  } else {
    html = await fetchWithProxy(url);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const baseElement = doc.createElement("base");
  baseElement.href = url;
  doc.head.prepend(baseElement);

  const ogp = extractOGPData(doc);
  const docClone = doc.cloneNode(true) as Document;
  const reader = new Readability(docClone);
  const article = reader.parse();

  if (!article) {
    throw new Error("本文の抽出に失敗しました。このページは対応していない可能性があります。");
  }

  const sanitizedContent = sanitizeHtml(article.content);
  return {
    title: ogp.title || article.title || doc.title || "無題",
    content: sanitizedContent,
    textContent: article.textContent,
    excerpt: ogp.description || article.excerpt || "",
    byline: article.byline,
    siteName: ogp.siteName || article.siteName,
    thumbnailUrl: resolveUrl(url, ogp.image),
    sourceUrl: url,
  };
}
