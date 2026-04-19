/**
 * YouTube メタデータ + 字幕取得サービス（youtubei.js ベース）。
 * YouTube metadata and transcript fetching service (powered by youtubei.js).
 *
 * 旧実装は YouTube Data API v3 + youtube-transcript の組み合わせだったが、
 * - youtube-transcript@1.3.0 の ESM パッケージング不具合
 * - YouTube Data API v3 のクォータ消費
 * の 2 点を回避するため youtubei.js (Innertube クライアント) に統合。
 *
 * The previous implementation combined the YouTube Data API v3 and the
 * youtube-transcript package. We migrated to youtubei.js (an InnerTube
 * client) to avoid the ESM packaging bug in youtube-transcript@1.3.0 and
 * to eliminate YouTube Data API quota consumption — both metadata and
 * transcripts are fetched from a single Innertube session.
 */
import { Innertube } from "youtubei.js";
import type { YT, YTNodes, Misc } from "youtubei.js";

// 公開エクスポートされた namespace 経由で型を取り出す。
// Pull internal class types via the package's public namespace re-exports.
type TranscriptInfo = YT.TranscriptInfo;
type PlayerMicroformat = YTNodes.PlayerMicroformat;
type TranscriptSegmentClass = YTNodes.TranscriptSegment;
type Thumbnail = Misc.Thumbnail;

/**
 * YouTube 外部 API 呼び出しのデフォルトタイムアウト（ミリ秒）。
 * Default timeout for outbound YouTube API calls, in milliseconds.
 */
export const YT_FETCH_TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * YouTube 動画メタデータ。
 * YouTube video metadata retrieved via Innertube.
 */
export interface YouTubeMetadata {
  /** 動画タイトル / Video title */
  title: string;
  /** 動画説明文 / Video description */
  description: string;
  /** チャンネル名 / Channel name */
  channelTitle: string;
  /** 公開日時 (YYYY-MM-DD またはそれに近い ISO 文字列) / Published date */
  publishedAt: string;
  /** 再生時間 (ISO 8601 duration, 例: "PT1H2M3S") / Duration as ISO 8601 */
  duration: string;
  /** サムネイル URL (最大解像度) / Thumbnail URL (max resolution) */
  thumbnailUrl: string;
  /** タグ / Tags */
  tags: string[];
}

/**
 * YouTube 字幕テキストのセグメント。
 * A single transcript segment with timing information.
 */
export interface TranscriptSegment {
  /** テキスト / Text content */
  text: string;
  /** 開始時間（秒） / Start time in seconds */
  offset: number;
  /** 継続時間（秒） / Duration in seconds */
  duration: number;
}

/**
 * YouTube コンテンツ取得結果。
 * Complete YouTube content retrieval result.
 */
export interface YouTubeContent {
  /** 動画メタデータ / Video metadata */
  metadata: YouTubeMetadata;
  /** 字幕テキスト（取得できない場合は null） / Transcript (null if unavailable) */
  transcript: TranscriptSegment[] | null;
  /** 字幕の全文テキスト / Full transcript text */
  transcriptText: string;
}

// ── Duration helpers ──────────────────────────────────────────────────────

/**
 * ISO 8601 duration (e.g. "PT1H2M3S") を人間が読みやすい形式に変換する。
 * Converts ISO 8601 duration to a human-readable format.
 *
 * @param iso - ISO 8601 duration string (e.g. "PT1H2M3S")
 * @returns 人間が読みやすい形式 (e.g. "1:02:03") / Human-readable format
 */
export function formatDuration(iso: string): string {
  // ISO 8601 duration: P[nD]T[nH][nM][nS]
  // 長時間配信アーカイブ等の day 表記にも対応する
  // Support day-prefixed durations like "P1DT2H..." for long livestream VODs
  const match = iso.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;

  const days = Number.parseInt(match[1] ?? "0", 10);
  const hours = Number.parseInt(match[2] ?? "0", 10) + days * 24;
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  const seconds = Number.parseInt(match[4] ?? "0", 10);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 秒数を ISO 8601 duration 文字列に変換する。
 * Converts a number of seconds to an ISO 8601 duration string.
 *
 * youtubei.js は再生時間を秒で返すが、`formatDuration` および下流コードは
 * ISO 8601 形式 (例 "PT1H2M3S") を前提としているため変換する。
 *
 * youtubei.js exposes the duration in seconds, but `formatDuration` and
 * downstream consumers expect ISO 8601 form (e.g. "PT1H2M3S").
 */
function secondsToIso8601Duration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  let out = "PT";
  if (hours > 0) out += `${hours}H`;
  if (minutes > 0) out += `${minutes}M`;
  // 0 秒の動画は事実上ないが、空文字 "PT" を避けるため秒を常に出力
  // Always emit the seconds component to avoid producing a bare "PT".
  if (seconds > 0 || (hours === 0 && minutes === 0)) out += `${seconds}S`;
  return out;
}

// ── Innertube singleton ───────────────────────────────────────────────────

/**
 * Innertube インスタンスは初期化に外部 HTTP リクエストを伴うため、
 * プロセス内でシングルトンとしてキャッシュする。
 *
 * Innertube initialisation issues outbound HTTP requests, so the instance
 * is memoised per process to amortise that cost across calls.
 */
let innertubePromise: Promise<Innertube> | null = null;

async function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    // retrieve_player: false でセッション初期化を高速化（字幕/メタデータ取得には player.js 不要）。
    // Skip JS player retrieval — it is only needed for stream deciphering.
    // 初期化失敗時はキャッシュをクリアし、次回呼び出しで再試行できるようにする。
    // Reset the cache on failure so transient initialisation errors don't
    // permanently break the service for the rest of the process lifetime.
    innertubePromise = Innertube.create({
      retrieve_player: false,
    }).catch((err) => {
      innertubePromise = null;
      throw err;
    });
  }
  return innertubePromise;
}

/**
 * テスト用に Innertube シングルトンキャッシュをリセットする。
 * Resets the cached Innertube singleton (test-only helper).
 *
 * @internal
 */
export function __resetInnertubeForTesting(): void {
  innertubePromise = null;
}

// ── Promise timeout helper ────────────────────────────────────────────────

/**
 * Promise にタイムアウトを付与する。タイムアウト時は reject。
 * Wraps a promise with a timeout. Rejects when timeout elapses.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

// ── Metadata extraction ───────────────────────────────────────────────────

/**
 * Innertube `VideoInfo` からアプリ層が必要とするメタデータを抽出する。
 * Extracts the metadata fields the app cares about from an Innertube `VideoInfo`.
 */
function extractMetadata(
  videoId: string,
  info: Awaited<ReturnType<Innertube["getInfo"]>>,
): YouTubeMetadata {
  const basic = info.basic_info;

  // タイトル: basic_info を優先、なければ ID ベースのフォールバック
  // Prefer basic_info.title, fall back to id-based label
  const title = basic.title?.trim() || `YouTube Video (${videoId})`;

  // 説明文: basic_info.short_description が公式 description
  // basic_info.short_description holds the canonical description string
  const description = basic.short_description ?? "";

  // チャンネル名: basic_info.channel.name → basic_info.author の順で fallback
  // Channel name: prefer basic_info.channel.name, then basic_info.author
  const channelTitle = basic.channel?.name ?? basic.author ?? "";

  // 公開日時: PlayerMicroformat.publish_date (例 "2024-01-15") を優先
  // basic_info.start_timestamp (Date) があればそちらを ISO に
  // Prefer PlayerMicroformat.publish_date (e.g. "2024-01-15"), fall back to start_timestamp.
  const microformat = info.page[0]?.microformat as PlayerMicroformat | undefined;
  const publishedAt = microformat?.publish_date ?? basic.start_timestamp?.toISOString() ?? "";

  // 再生時間: 値が無い場合は空文字（"PT0S" を捏造して "0:00" 表示にしない）
  // Duration: leave as empty string when missing — avoid fabricating "PT0S"
  // which would render as "0:00" downstream and misrepresent the metadata.
  const duration = basic.duration != null ? secondsToIso8601Duration(basic.duration) : "";

  // サムネイル: 最大解像度のものを選択。配列が空なら hqdefault に fallback
  // Thumbnail: pick the largest by width; fall back to hqdefault when none returned.
  const thumbnailUrl =
    pickLargestThumbnail(basic.thumbnail) ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // タグ: basic_info.tags / keywords どちらかが入る場合あり
  // Tags: basic_info.tags or basic_info.keywords (whichever is populated)
  const tags = basic.tags ?? basic.keywords ?? [];

  return {
    title,
    description,
    channelTitle,
    publishedAt,
    duration,
    thumbnailUrl,
    tags,
  };
}

/**
 * サムネイル配列から最大幅の URL を選ぶ。空配列なら null。
 * Returns the URL of the widest thumbnail, or null when the list is empty.
 */
function pickLargestThumbnail(thumbnails: Thumbnail[] | undefined | null): string | null {
  if (!thumbnails || thumbnails.length === 0) return null;
  // 配列内の null/undefined 要素をスキップしつつ最大幅を選ぶ
  // Walk the entire list so a null/undefined first element doesn't drop later valid entries.
  let best: Thumbnail | null = null;
  for (const t of thumbnails) {
    if (t && (!best || t.width > best.width)) best = t;
  }
  return best?.url ?? null;
}

// ── Transcript extraction ─────────────────────────────────────────────────

/**
 * Innertube `TranscriptInfo` から `TranscriptSegment[]` を抽出する。
 * Extracts plain `TranscriptSegment[]` from an Innertube `TranscriptInfo`.
 */
function extractTranscriptSegments(transcriptInfo: TranscriptInfo): TranscriptSegment[] {
  const segments = transcriptInfo.transcript.content?.body?.initial_segments ?? [];
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    // セクションヘッダーは無視（字幕本文ではない）
    // Skip section headers (they are not transcript content)
    if (!isTranscriptSegment(seg)) continue;
    const startMs = Number.parseInt(seg.start_ms, 10);
    const endMs = Number.parseInt(seg.end_ms, 10);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    const text = seg.snippet.toString().trim();
    if (!text) continue;
    out.push({
      text,
      offset: startMs / 1000,
      duration: Math.max(0, (endMs - startMs) / 1000),
    });
  }
  return out;
}

/**
 * `TranscriptSegment | TranscriptSectionHeader` を識別する型ガード。
 * Type guard distinguishing `TranscriptSegment` from `TranscriptSectionHeader`.
 */
function isTranscriptSegment(node: unknown): node is TranscriptSegmentClass {
  return (
    typeof node === "object" &&
    node !== null &&
    "start_ms" in node &&
    "end_ms" in node &&
    "snippet" in node
  );
}

/**
 * 字幕セグメントをプレーンテキストに結合する。
 * Joins transcript segments into plain text.
 *
 * @param segments - 字幕セグメント / Transcript segments
 * @returns 結合されたテキスト / Joined text
 */
export function joinTranscriptText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(" ");
}

// ── Public entry point ────────────────────────────────────────────────────

/**
 * 最小限のメタデータ（取得失敗時のフォールバック）。
 * Minimal metadata used as a fallback when Innertube fails entirely.
 */
function buildMinimalMetadata(videoId: string): YouTubeMetadata {
  return {
    title: `YouTube Video (${videoId})`,
    description: "",
    channelTitle: "",
    publishedAt: "",
    duration: "",
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    tags: [],
  };
}

/**
 * YouTube 動画のメタデータと字幕を一括取得する。
 * Fetches both metadata and transcript for a YouTube video.
 *
 * Innertube の `getInfo()` 1 回でメタデータと字幕（`getTranscript()`）の
 * 両方を取得する。字幕が利用できない動画では transcript フィールドが
 * null になるが、メタデータ取得自体が失敗した場合でも最小限のメタデータで
 * フォールバックを返す。
 *
 * Uses a single Innertube `getInfo()` call followed by `getTranscript()`.
 * Returns transcript as null when captions are unavailable. Even when the
 * upstream call fails entirely, returns a minimal metadata fallback so the
 * caller never throws.
 *
 * @param videoId - YouTube 動画 ID / YouTube video ID
 * @param _youtubeApiKey - 互換性のため残存（youtubei.js 移行で不要） / Retained for backward compatibility (no longer used)
 * @returns メタデータと字幕 / Metadata and transcript
 */
export async function fetchYouTubeContent(
  videoId: string,
  _youtubeApiKey?: string,
): Promise<YouTubeContent> {
  let info: Awaited<ReturnType<Innertube["getInfo"]>>;
  try {
    const yt = await getInnertube();
    info = await withTimeout(yt.getInfo(videoId), YT_FETCH_TIMEOUT_MS, "youtubei.js getInfo");
  } catch (err) {
    // メタデータ取得失敗 — 最小フォールバックを返す（呼び出し側は throw しない契約）
    // Metadata fetch failed — return minimal fallback (callers expect no throw).
    console.error("youtubei.js getInfo failed (falling back to minimal):", err);
    const fallback = buildMinimalMetadata(videoId);
    return {
      metadata: fallback,
      transcript: null,
      transcriptText: "",
    };
  }

  // extractMetadata は `info` の想定形状に依存するため、youtubei.js が
  // 予期せぬ構造を返した場合でも "throw しない" 契約を守るために包む。
  // extractMetadata assumes a well-formed `info`; guard against unexpected
  // upstream shapes so the documented "never throws" contract still holds.
  let metadata: YouTubeMetadata;
  try {
    metadata = extractMetadata(videoId, info);
  } catch (err) {
    console.error("extractMetadata failed (falling back to minimal):", err);
    metadata = buildMinimalMetadata(videoId);
  }

  // 字幕取得は失敗しても致命的ではないので個別 try/catch
  // Transcript fetch is best-effort: missing captions must not throw.
  let segments: TranscriptSegment[] = [];
  try {
    const transcriptInfo = await withTimeout(
      info.getTranscript(),
      YT_FETCH_TIMEOUT_MS,
      "youtubei.js getTranscript",
    );
    segments = extractTranscriptSegments(transcriptInfo);
  } catch {
    // 字幕なし動画 / トランスクリプト無効化動画 — 空配列で続行
    // No captions available or transcripts disabled — continue with empty list.
    segments = [];
  }

  return {
    metadata,
    transcript: segments.length > 0 ? segments : null,
    transcriptText: joinTranscriptText(segments),
  };
}
