/**
 * Reusable URL → HTML → Readability → Tiptap JSON extraction pipeline.
 *
 * Extracted from `clipAndCreate.ts` so that the new Ingest flow (P1 of the
 * Karpathy "LLM Wiki" pattern, sub-issue #595) can run the same extraction
 * without persisting a page.
 *
 * clipAndCreate から切り出した、URL → Tiptap JSON までの純粋な抽出パイプライン。
 * Ingest プランナー（otomatty/zedi#595）が Page を保存せずに同じ抽出を行うために共有する。
 */
import { Mutex } from "async-mutex";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { generateJSON } from "@tiptap/html";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { common, createLowlight } from "lowlight";
import { createHash } from "node:crypto";
import { ClipFetchBlockedError, fetchClipHtmlWithRedirects } from "./clipServerFetch.js";
import { YouTubeEmbedServer } from "./youtubeEmbedServerExtension.js";
import { extractYouTubeContent } from "./youtubeExtractor.js";
import type { AIProviderType, TokenUsage } from "../types/index.js";

export { ClipFetchBlockedError };

const lowlight = createLowlight(common);

/**
 * Serializes globalThis.document mutation so concurrent extractor calls do not race.
 * 同時実行時に globalThis.document が取り合いにならないよう直列化する。
 */
const extractorDocMutex = new Mutex();

/**
 * Tiptap 拡張（サーバー側の正規化に使う）。
 * Tiptap extensions used for server-side normalization.
 */
export const articleExtractorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
  }),
  Link.configure({ openOnClick: false }),
  CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
  Image,
  YouTubeEmbedServer,
];

/**
 * Tiptap スキーマを構築する。主に Y.Doc 化のために呼び出される。
 * Builds the Tiptap schema; mainly used by downstream Y.Doc conversion.
 */
export function buildArticleSchema() {
  return getSchema(articleExtractorExtensions);
}

/**
 * Tiptap JSON のノード。
 * A Tiptap JSON node.
 */
export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * 抽出結果。
 * Extraction result shared by clipAndCreate and the ingest flow.
 *
 * @property finalUrl - リダイレクト後の最終 URL。Final URL after redirects.
 * @property title - 抽出したタイトル。Extracted title (fallback: "Untitled").
 * @property thumbnailUrl - OGP 由来のサムネイル URL（あれば）。OGP thumbnail URL if any.
 * @property tiptapJson - Tiptap 用 JSON ドキュメント。Tiptap JSON document.
 * @property contentText - 本文の先頭プレビュー（最大 length 文字）。Plain-text excerpt.
 * @property contentHash - 本文の SHA-256（dedup 用）。Content hash for dedup.
 */
export interface ExtractedArticle {
  finalUrl: string;
  title: string;
  thumbnailUrl: string | null;
  tiptapJson: TiptapNode;
  contentText: string;
  contentHash: string;
  /**
   * AI 要約が実際に実行された場合のトークン使用量（YouTube のみ）。
   * 通常の Readability 抽出では常に null。
   *
   * Token usage when AI summary was actually executed (YouTube only).
   * Always null for regular Readability-based extraction.
   */
  aiUsage?: TokenUsage | null;
}

/**
 * 本文抽出で使うフェッチタイムアウト既定値（ミリ秒）。
 * Default fetch timeout for article extraction, in milliseconds.
 */
export const ARTICLE_FETCH_TIMEOUT_MS = 15_000;

/**
 * ExtractArticle の入力。
 * Input for {@link extractArticleFromUrl}.
 *
 * @property url - 抽出対象の URL（http/https のみ）。Target URL (http/https only).
 * @property timeoutMs - フェッチのタイムアウト。Fetch timeout.
 * @property previewLength - contentText のプレビュー長。Length of content preview in characters.
 */
export interface ExtractArticleInput {
  url: string;
  timeoutMs?: number;
  previewLength?: number;
  /**
   * YouTube Data API キー。YouTube URL の場合にメタデータ取得に使用。
   * YouTube Data API key. Used for metadata retrieval when URL is a YouTube video.
   */
  youtubeApiKey?: string;
  /**
   * AI プロバイダー。YouTube URL の場合に要約生成に使用。
   * AI provider for YouTube summary generation.
   */
  aiProvider?: AIProviderType;
  /**
   * AI モデル ID。YouTube URL の場合に要約生成に使用。
   * AI model ID for YouTube summary generation.
   */
  aiModel?: string;
  /**
   * AI プロバイダーの API キー。YouTube URL の場合に要約生成に使用。
   * AI provider API key for YouTube summary generation.
   */
  aiApiKey?: string;
}

/**
 * `<meta property="og:image">` を抽出する。
 * Extracts `<meta property="og:image">` from the document.
 */
function extractOgImage(doc: Document): string | null {
  const meta =
    doc.querySelector('meta[property="og:image"]') || doc.querySelector('meta[name="og:image"]');
  return meta?.getAttribute("content") || null;
}

/**
 * 相対 URL を絶対 URL に解決する。http/https 以外は null。
 * Resolves a relative URL to absolute. Returns null for non-http(s) schemes.
 */
function resolveUrl(base: string, relative: string | null): string | null {
  if (!relative) return null;
  try {
    const resolved = new URL(relative, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.href;
  } catch {
    return null;
  }
}

/**
 * script / iframe 等の不要タグを除去する。
 * Strips script / iframe / form / etc. from the provided HTML fragment.
 */
function cleanupHtml(html: string, doc: Document): string {
  const div = doc.createElement("div");
  div.innerHTML = html;

  const unwanted = ["script", "style", "noscript", "iframe", "object", "embed", "form"];
  for (const sel of unwanted) {
    div.querySelectorAll(sel).forEach((el) => {
      el.remove();
    });
  }
  return div.innerHTML.trim();
}

/**
 * Tiptap JSON からテキストを抽出して空白圧縮する。
 * Walks a Tiptap JSON tree and joins the inline text content.
 */
export function extractTextFromTiptap(node: TiptapNode | null): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content
    .map((child) => extractTextFromTiptap(child))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * YouTube URL から動画 ID を抽出する（サーバーサイド版）。
 * Extracts a YouTube video ID from various YouTube URL formats (server-side).
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^&]+&)*v=([a-zA-Z0-9_-]{11})(?:&[^\s]*)?$/i,
    /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$/i,
    /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * URL から記事を抽出して Tiptap JSON / プレビュー / コンテンツハッシュを返す。
 * Fetches a URL and extracts a Tiptap JSON document plus preview and content hash.
 *
 * Page の作成はここでは行わない（DB 書き込みなし）。ingest プランナーと
 * clipAndCreate の両方から再利用される。
 * This helper is pure with respect to the database; it performs fetching and
 * parsing only.
 *
 * YouTube URL（watch / youtu.be / embed）の場合は専用パイプライン
 * ({@link extractYouTubeContent}) に委譲し、動画埋め込み + メタデータ + 任意の
 * AI 要約を含む Tiptap JSON を返す。それ以外の URL は Readability による本文抽出。
 *
 * When the URL is a YouTube watch/short/embed link, delegates to the dedicated
 * pipeline ({@link extractYouTubeContent}) which returns a Tiptap JSON doc with
 * embed + metadata + optional AI summary. All other URLs are processed via
 * Readability-based article extraction.
 *
 * @param input - 抽出入力。Extraction input.
 * @returns 抽出された Tiptap JSON ドキュメントとメタデータ。Parsed article.
 * @throws URL が許可されない、fetch 失敗、Readability 抽出失敗時。
 * Throws when URL is disallowed, fetch fails, or Readability cannot parse.
 */
export async function extractArticleFromUrl(input: ExtractArticleInput): Promise<ExtractedArticle> {
  const { url, timeoutMs = ARTICLE_FETCH_TIMEOUT_MS, previewLength = 200 } = input;

  // YouTube URL の場合は専用パイプラインに委譲
  // Delegate to YouTube-specific pipeline for YouTube URLs
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    return extractYouTubeContent({
      videoId,
      youtubeApiKey: input.youtubeApiKey,
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      aiApiKey: input.aiApiKey,
      previewLength,
    });
  }

  /**
   *
   */
  const controller = new AbortController();
  /**
   *
   */
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  /**
   *
   */
  let html: string;
  /**
   *
   */
  let finalUrl: string;
  try {
    try {
      ({ html, finalUrl } = await fetchClipHtmlWithRedirects(url, controller));
    } catch (err) {
      if (err instanceof ClipFetchBlockedError) {
        // Preserve the original error type so callers can differentiate
        // policy-blocked URLs from other fetch failures.
        throw err;
      }
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }

  /**
   *
   */
  const dom = new JSDOM(html, { url: finalUrl });
  /**
   *
   */
  const document = dom.window.document;

  /**
   *
   */
  const reader = new Readability(document.cloneNode(true) as Document);
  /**
   *
   */
  const article = reader.parse();
  if (!article) {
    throw new Error("Failed to extract article content");
  }

  /**
   *
   */
  const ogImage = extractOgImage(document);
  /**
   *
   */
  const thumbnailUrl = resolveUrl(finalUrl, ogImage);

  /**
   *
   */
  const cleanContent = cleanupHtml(article.content ?? "", document);

  /**
   *
   */
  const mainJson = await extractorDocMutex.runExclusive(async () => {
    /**
     *
     */
    const prevDocument = (globalThis as { document?: Document }).document;
    (globalThis as { document?: Document }).document = document;
    try {
      return generateJSON(cleanContent, articleExtractorExtensions) as TiptapNode;
    } finally {
      (globalThis as { document?: Document }).document = prevDocument;
    }
  });

  /**
   *
   */
  const baseContent = Array.isArray(mainJson.content) ? mainJson.content : [];
  /**
   *
   */
  const imageNode: TiptapNode | null = thumbnailUrl
    ? {
        type: "image",
        attrs: {
          src: thumbnailUrl,
          alt: article.title ?? "OGP thumbnail",
        },
      }
    : null;
  /**
   *
   */
  const tiptapJson: TiptapNode = {
    type: "doc",
    content: imageNode ? [imageNode, ...baseContent] : baseContent,
  };

  /**
   *
   */
  const rawText = extractTextFromTiptap(tiptapJson);
  /**
   *
   */
  const contentText = rawText.slice(0, previewLength);
  /**
   *
   */
  const title = article.title || "Untitled";

  /**
   *
   */
  const contentHash = createHash("sha256").update(rawText).digest("hex");

  return {
    finalUrl,
    title,
    thumbnailUrl,
    tiptapJson,
    contentText,
    contentHash,
  };
}
