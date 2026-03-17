/**
 * Web Clipper で利用する型定義。
 * Type definitions for Web Clipper.
 */

/** クリップ結果のコンテンツ。 / Clipped content result. */
export interface ClippedContent {
  title: string;
  content: string; // HTML形式 / HTML
  textContent: string; // プレーンテキスト / plain text
  excerpt: string; // 要約 / excerpt
  byline: string | null; // 著者 / author
  siteName: string | null; // サイト名 / site name
  thumbnailUrl: string | null;
  sourceUrl: string;
}

/** OGP メタデータ。 / OGP meta data. */
export interface OGPData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/** HTML 取得関数の型。 / Type for HTML fetch function. */
export type FetchHtmlFn = (url: string) => Promise<string>;
