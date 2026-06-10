/**
 * サーバーの `ALLOWED_UPLOAD_TYPES`（server/api/src/routes/media.ts）と一致させた
 * クライアント側の許可 MIME セット。ここが緩いとサーバーに弾かれて生の HTTP 415
 * 文字列がユーザーに見えてしまうため、二重定義してでも同期させる。
 *
 * Mirror of the server's `ALLOWED_UPLOAD_TYPES` so we surface a friendly,
 * localized error before the request ever hits the server.
 */
export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/apng",
  "image/bmp",
  "image/x-ms-bmp",
]);
export const ALLOWED_VIDEO_MIME = new Set(["video/webm", "video/mp4"]);
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * バリデーション / アップロード失敗を表す型付きエラー。`code` は i18n キー
 * `editor.media.errors.*` に対応するため、呼び出し側は `t` で訳語へ変換できる。
 * `message` にサーバー由来の訳済みメッセージが入っている場合はそれを優先表示する。
 *
 * Typed error for validation / upload failures. `code` maps to the
 * `editor.media.errors.*` i18n keys so callers can translate it; when
 * `message` carries a server-localized string, callers prefer that.
 */
export type MediaUploadErrorCode = "unsupportedType" | "tooLarge" | "uploadFailed";

export class MediaUploadError extends Error {
  readonly code: MediaUploadErrorCode;
  constructor(code: MediaUploadErrorCode, message = "") {
    super(message);
    this.name = "MediaUploadError";
    this.code = code;
  }
}

/**
 * VITE_API_BASE_URL で分離構成される本番環境でも `/api/media/*` が正しい API
 * オリジンへ飛ぶよう、ベース URL を解決する。フロントエンド = API のときは空文字で
 * フォールバックし、相対 URL のまま発行する。
 *
 * Resolves the API origin so split deployments with `VITE_API_BASE_URL`
 * route `/api/media/*` to the correct host.
 */
export function resolveApiBaseUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
  return base.replace(/\/$/, "");
}

/**
 * レスポンスから人間向けエラーメッセージを抽出する。サーバーは
 * `{ ok: false, error: { message } }` または `{ message }` を返す。抽出できない
 * 場合は空文字を返し、呼び出し側で i18n フォールバックさせる。
 *
 * Extracts a human-readable message from an API error response; returns "" when
 * none is present so the caller can fall back to a localized default.
 */
async function extractServerErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      ok?: boolean;
      error?: { message?: string };
      message?: string;
    } | null;
    return data?.error?.message ?? data?.message ?? "";
  } catch {
    return "";
  }
}

interface UploadMediaFileOptions {
  /** API オリジン。未指定なら resolveApiBaseUrl() を使う。 */
  apiBaseUrl?: string;
  /**
   * 許可 MIME セット。未指定なら画像 ∪ 動画の全許可形式。呼び出し側がモードや
   * 種別に応じて絞り込む（例: 動画 D&D 経路では ALLOWED_VIDEO_MIME）。
   */
  allowedMime?: Set<string>;
}

/**
 * presigned 2 段アップロード（POST /api/media/upload → PUT → POST /api/media/confirm）
 * を実行し、最終的に表示用の URL と media_id を返す。MIME / サイズ検証もここで行い、
 * 失敗時は `MediaUploadError` を投げる。MediaPlaceholderNodeView とエディタ面の
 * D&D / ペースト経路で共有する単一の入口。
 *
 * Runs the presigned upload flow and returns the playable src + media id.
 * Throws `MediaUploadError` on validation / network failure. Shared entry point
 * for the placeholder card and the editor-level drag-drop / paste paths.
 */
export async function uploadMediaFile(
  file: File,
  opts: UploadMediaFileOptions = {},
): Promise<{ src: string; mediaId: string }> {
  const allowedMime = opts.allowedMime ?? new Set([...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]);
  if (!allowedMime.has(file.type.toLowerCase())) {
    throw new MediaUploadError("unsupportedType");
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new MediaUploadError("tooLarge");
  }

  const apiBaseUrl = opts.apiBaseUrl ?? resolveApiBaseUrl();

  const presign = await fetch(`${apiBaseUrl}/api/media/upload`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: file.name,
      content_type: file.type,
      file_size: file.size,
    }),
  });
  if (!presign.ok) {
    throw new MediaUploadError("uploadFailed", await extractServerErrorMessage(presign));
  }
  const { upload_url, media_id, s3_key } = (await presign.json()) as {
    upload_url: string;
    media_id: string;
    s3_key: string;
  };

  const put = await fetch(upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) {
    throw new MediaUploadError("uploadFailed");
  }

  const confirm = await fetch(`${apiBaseUrl}/api/media/confirm`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_id,
      s3_key,
      file_name: file.name,
      content_type: file.type,
      file_size: file.size,
    }),
  });
  if (!confirm.ok) {
    throw new MediaUploadError("uploadFailed", await extractServerErrorMessage(confirm));
  }

  return { src: `${apiBaseUrl}/api/media/${media_id}`, mediaId: media_id };
}
