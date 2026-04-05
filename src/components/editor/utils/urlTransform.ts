/**
 * 外部URLをビジュアル要素に変換するためのユーティリティ。
 * Utility for transforming external URLs into visual elements (images, embeds).
 */

// --- Gyazo ---

const GYAZO_PERMALINK_PATTERN = /^https?:\/\/gyazo\.com\/([a-f0-9]{32})$/i;

/**
 * Gyazo パーマリンクを画像 URL に変換する。
 * Converts a Gyazo permalink to a direct image URL.
 *
 * @example
 * gyazoToImageUrl("https://gyazo.com/abc123...") // "https://i.gyazo.com/abc123....png"
 */
export function gyazoToImageUrl(url: string): string | null {
  const match = url.match(GYAZO_PERMALINK_PATTERN);
  if (!match) return null;
  return `https://i.gyazo.com/${match[1]}.png`;
}

/**
 * URL が Gyazo パーマリンクかどうか判定する。
 * Check if a URL is a Gyazo permalink.
 */
export function isGyazoUrl(url: string): boolean {
  return GYAZO_PERMALINK_PATTERN.test(url);
}

// --- YouTube ---

const YOUTUBE_WATCH_PATTERN =
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^&]+&)*v=([a-zA-Z0-9_-]{11})(?:&[^\s]*)?$/;
const YOUTUBE_SHORT_PATTERN = /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$/;
const YOUTUBE_EMBED_PATTERN =
  /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$/;

/**
 * YouTube URL から動画 ID を抽出する。
 * Extracts a YouTube video ID from various YouTube URL formats.
 *
 * @returns 動画 ID、または null / Video ID or null
 */
export function extractYouTubeVideoId(url: string): string | null {
  for (const pattern of [YOUTUBE_WATCH_PATTERN, YOUTUBE_SHORT_PATTERN, YOUTUBE_EMBED_PATTERN]) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * URL が YouTube 動画 URL かどうか判定する。
 * Check if a URL is a YouTube video URL.
 */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * YouTube 動画 ID を埋め込み用 URL に変換する。
 * Converts a YouTube video ID to an embed URL.
 */
export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

// --- General ---

/** URL 変換結果の型 / URL transformation result type */
export type UrlTransformResult =
  | { type: "gyazo-image"; imageUrl: string; originalUrl: string }
  | { type: "youtube-embed"; videoId: string; embedUrl: string; originalUrl: string }
  | null;

/**
 * URL を解析し、変換可能であれば変換結果を返す。
 * Analyzes a URL and returns a transformation result if applicable.
 */
export function transformUrl(url: string): UrlTransformResult {
  const trimmed = url.trim();

  const gyazoImage = gyazoToImageUrl(trimmed);
  if (gyazoImage) {
    return { type: "gyazo-image", imageUrl: gyazoImage, originalUrl: trimmed };
  }

  const videoId = extractYouTubeVideoId(trimmed);
  if (videoId) {
    return {
      type: "youtube-embed",
      videoId,
      embedUrl: youTubeEmbedUrl(videoId),
      originalUrl: trimmed,
    };
  }

  return null;
}
