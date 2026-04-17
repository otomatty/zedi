/**
 * YouTube Data API v3 + 字幕取得サービス。
 * YouTube Data API v3 metadata retrieval and transcript fetching service.
 *
 * - メタデータ: YouTube Data API v3 (videos.list) を使用
 * - 字幕テキスト: youtube-transcript パッケージ（非公式、API キー不要）を使用
 *
 * YouTube Data API の captions.download は OAuth2（動画オーナーのみ）が必要なため、
 * 公開字幕の取得には youtube-transcript を使用する。
 */
import { YoutubeTranscript, type TranscriptResponse } from "youtube-transcript";

/**
 * YouTube 外部 API 呼び出しのデフォルトタイムアウト（ミリ秒）。
 * Default timeout for outbound YouTube API calls, in milliseconds.
 */
export const YT_FETCH_TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * YouTube 動画メタデータ。
 * YouTube video metadata retrieved from the Data API.
 */
export interface YouTubeMetadata {
  /** 動画タイトル / Video title */
  title: string;
  /** 動画説明文 / Video description */
  description: string;
  /** チャンネル名 / Channel name */
  channelTitle: string;
  /** 公開日時 (ISO 8601) / Published date */
  publishedAt: string;
  /** 再生時間 (ISO 8601 duration) / Duration */
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

// ── Metadata ──────────────────────────────────────────────────────────────

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
 * YouTube Data API v3 で動画メタデータを取得する。
 * Fetches video metadata from YouTube Data API v3.
 *
 * @param videoId - YouTube 動画 ID / YouTube video ID
 * @param apiKey - YouTube Data API キー / YouTube Data API key
 * @returns メタデータ / Video metadata
 * @throws API エラーまたはレスポンス解析失敗時 / On API error or parse failure
 */
export async function fetchYouTubeMetadata(
  videoId: string,
  apiKey: string,
  timeoutMs: number = YT_FETCH_TIMEOUT_MS,
): Promise<YouTubeMetadata> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  // タイムアウト付きの fetch（上流の遅延で全体をブロックしないようにする）
  // Fetch with abort-based timeout so slow upstream doesn't pin the request
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`YouTube Data API request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube Data API failed: ${res.status} - ${text}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      snippet: {
        title: string;
        description: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails: Record<string, { url: string; width: number; height: number }>;
        tags?: string[];
      };
      contentDetails: {
        duration: string;
      };
    }>;
  };

  if (!data.items || data.items.length === 0) {
    throw new Error(`YouTube video not found: ${videoId}`);
  }

  const item = data.items[0] as NonNullable<(typeof data.items)[number]>;
  const snippet = item.snippet;
  const thumbnails = snippet.thumbnails;

  // 最大解像度のサムネイルを選択 / Select highest resolution thumbnail
  const thumbnailUrl =
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  return {
    title: snippet.title,
    description: snippet.description,
    channelTitle: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    duration: item.contentDetails?.duration ?? "",
    thumbnailUrl,
    tags: snippet.tags ?? [],
  };
}

// ── Transcript ────────────────────────────────────────────────────────────

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

/**
 * YouTube 動画の公開字幕テキストを取得する。
 * Fetches public captions/subtitles for a YouTube video.
 *
 * youtube-transcript パッケージを使用（非公式、API キー不要）。
 * 字幕が利用できない場合は空配列を返す（エラーは throw しない）。
 * 上流が応答しない場合に備え、各試行に `timeoutMs` のタイムアウトを適用する。
 *
 * Uses the youtube-transcript package (unofficial, no API key required).
 * Returns an empty array when captions are unavailable (never throws).
 * Each attempt is bounded by `timeoutMs` to avoid hanging on a slow upstream.
 *
 * @param videoId - YouTube 動画 ID / YouTube video ID
 * @param timeoutMs - 各フェッチ試行のタイムアウト (ms) / Per-attempt timeout in ms
 * @returns 字幕セグメント配列 / Transcript segments (empty if unavailable)
 */
export async function fetchYouTubeTranscript(
  videoId: string,
  timeoutMs: number = YT_FETCH_TIMEOUT_MS,
): Promise<TranscriptSegment[]> {
  // youtube-transcript は signal を受け付けないため、タイムアウトは Promise.race で実装
  // youtube-transcript does not accept a signal, so timeout is enforced via promise race
  try {
    const transcriptItems = await withTimeout<TranscriptResponse[]>(
      YoutubeTranscript.fetchTranscript(videoId, { lang: "ja" }),
      timeoutMs,
      "YouTube transcript fetch (ja)",
    );

    return transcriptItems.map((item) => ({
      text: item.text,
      offset: item.offset / 1000, // ms → sec
      duration: item.duration / 1000, // ms → sec
    }));
  } catch {
    // 日本語字幕が無い場合、言語指定なしで再試行
    // If Japanese subtitles unavailable, retry without language preference
    try {
      const transcriptItems = await withTimeout<TranscriptResponse[]>(
        YoutubeTranscript.fetchTranscript(videoId),
        timeoutMs,
        "YouTube transcript fetch",
      );

      return transcriptItems.map((item) => ({
        text: item.text,
        offset: item.offset / 1000,
        duration: item.duration / 1000,
      }));
    } catch {
      // 字幕なし動画 — 空配列を返す / No captions available
      return [];
    }
  }
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

// ── Combined ──────────────────────────────────────────────────────────────

/**
 * API キー未指定時の最小限のメタデータを返す。
 * Returns minimal metadata when the Data API key is missing or fails.
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
 * YouTube Data API キーが指定されていない場合、メタデータは最小限の情報のみ返す。
 * キーが指定されているがメタデータ取得に失敗した場合（quota 超過・無効キー等）も、
 * 字幕のみでフォールバックを提供する。
 *
 * When no API key is provided, returns minimal metadata (title from videoId only).
 * Even when a key is provided, a failing metadata request (quota exhausted,
 * invalid key, transient failure) is caught and replaced with minimal metadata
 * so the transcript-only fallback is preserved.
 *
 * @param videoId - YouTube 動画 ID / YouTube video ID
 * @param youtubeApiKey - YouTube Data API キー（任意） / YouTube Data API key (optional)
 * @returns メタデータと字幕 / Metadata and transcript
 */
export async function fetchYouTubeContent(
  videoId: string,
  youtubeApiKey?: string,
): Promise<YouTubeContent> {
  // 字幕は常に取得を試みる（API キー不要）
  // Always attempt transcript fetch (no API key required)
  const transcriptPromise = fetchYouTubeTranscript(videoId);

  let metadata: YouTubeMetadata;
  if (youtubeApiKey) {
    // メタデータ取得失敗（quota 超過・無効キー等）でも字幕 fallback を維持する
    // Keep transcript-only fallback even when metadata fetch fails (quota, invalid key, etc.)
    const [metaResult, transcriptResult] = await Promise.allSettled([
      fetchYouTubeMetadata(videoId, youtubeApiKey),
      transcriptPromise,
    ]);
    const transcript = transcriptResult.status === "fulfilled" ? transcriptResult.value : [];
    if (metaResult.status === "fulfilled") {
      metadata = metaResult.value;
    } else {
      console.error("YouTube metadata fetch failed (falling back to minimal):", metaResult.reason);
      metadata = buildMinimalMetadata(videoId);
    }
    const transcriptText = joinTranscriptText(transcript);
    return {
      metadata,
      transcript: transcript.length > 0 ? transcript : null,
      transcriptText,
    };
  }

  // API キーなし — 字幕のみ取得、メタデータは最小限
  // No API key — transcript only, minimal metadata
  const transcript = await transcriptPromise;
  metadata = {
    title: `YouTube Video (${videoId})`,
    description: "",
    channelTitle: "",
    publishedAt: "",
    duration: "",
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    tags: [],
  };

  return {
    metadata,
    transcript: transcript.length > 0 ? transcript : null,
    transcriptText: joinTranscriptText(transcript),
  };
}
