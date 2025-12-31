/**
 * Web Clipping機能 - URLからWebページの本文を抽出
 */
import { Readability } from "@mozilla/readability";

// CORSプロキシ（複数のフォールバックを用意）
const CORS_PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
];

export interface ClippedContent {
  title: string;
  content: string; // HTML形式
  textContent: string; // プレーンテキスト
  excerpt: string; // 要約
  byline: string | null; // 著者
  siteName: string | null; // サイト名
  thumbnailUrl: string | null;
  sourceUrl: string;
}

export interface OGPData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/**
 * URLが有効かどうかを検証
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * CORSプロキシ経由でHTMLを取得
 */
async function fetchWithProxy(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (const proxy of CORS_PROXIES) {
    try {
      const response = await fetch(proxy + encodeURIComponent(url), {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Proxy ${proxy} failed:`, error);
      continue;
    }
  }

  throw lastError || new Error("すべてのプロキシでページの取得に失敗しました");
}

/**
 * HTMLからOGP情報を抽出
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
    description:
      getMetaContent("og:description") || getMetaContent("description"),
    image: getMetaContent("og:image"),
    siteName: getMetaContent("og:site_name"),
  };
}

/**
 * 相対URLを絶対URLに変換
 */
function resolveUrl(base: string, relative: string | null): string | null {
  if (!relative) return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * HTMLをサニタイズ（危険なタグを除去）
 */
function sanitizeHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  // 危険な要素を削除
  const unwantedSelectors = [
    "script",
    "style",
    "iframe",
    "noscript",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "[onclick]",
    "[onerror]",
    "[onload]",
  ];

  unwantedSelectors.forEach((selector) => {
    const elements = div.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  });

  // 危険な属性を削除
  const allElements = div.querySelectorAll("*");
  allElements.forEach((el) => {
    const attributesToRemove: string[] = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith("on") || attr.name === "style") {
        attributesToRemove.push(attr.name);
      }
    }
    attributesToRemove.forEach((attr) => el.removeAttribute(attr));
  });

  return div.innerHTML;
}

/**
 * WebページをクリップしてコンテンツをBatch抽出
 */
export async function clipWebPage(url: string): Promise<ClippedContent> {
  if (!isValidUrl(url)) {
    throw new Error("有効なURLを入力してください");
  }

  // 1. HTMLを取得
  const html = await fetchWithProxy(url);

  // 2. DOMをパース
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // base URLを設定（相対パスの解決用）
  const baseElement = doc.createElement("base");
  baseElement.href = url;
  doc.head.prepend(baseElement);

  // 3. OGP情報を抽出
  const ogp = extractOGPData(doc);

  // 4. Readabilityで本文抽出
  // Readabilityはdocを変更するのでクローンを渡す
  const docClone = doc.cloneNode(true) as Document;
  const reader = new Readability(docClone);
  const article = reader.parse();

  if (!article) {
    throw new Error(
      "本文の抽出に失敗しました。このページは対応していない可能性があります。"
    );
  }

  // サニタイズされたコンテンツ
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

/**
 * クリップエラーをユーザーフレンドリーなメッセージに変換
 */
export function getClipErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("有効なURL")) {
      return "有効なURLを入力してください。";
    }
    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError")
    ) {
      return "ネットワークエラーが発生しました。接続を確認してください。";
    }
    if (error.message.includes("本文の抽出")) {
      return "本文の抽出に失敗しました。このページは対応していない可能性があります。";
    }
    if (error.message.includes("プロキシ")) {
      return "ページの取得に失敗しました。URLを確認してください。";
    }
    return error.message;
  }
  return "予期しないエラーが発生しました。";
}
