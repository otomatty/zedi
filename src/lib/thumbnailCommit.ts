/**
 * サムネイル画像を URL からストレージへ保存する共通ユーティリティ。
 * useThumbnailCommit（エディタ）と WebClipperDialog から使用される。
 *
 * Shared utility to commit an image from a URL to thumbnail storage via the API.
 * Used by useThumbnailCommit (editor) and WebClipperDialog.
 */

/**
 * 401 応答時に呼び出し側でサインイン誘導を行うための例外クラス。
 * 呼び出し側が必要に応じてリダイレクトやトースト表示を行う。
 *
 * Exception class thrown on 401 responses.
 * Callers decide how to handle it (redirect, toast, etc.).
 */
export class AuthRedirectError extends Error {
  readonly redirectToSignIn = true;
  /**
   * 指定メッセージで AuthRedirectError を生成する。
   * Creates an AuthRedirectError with the given message.
   *
   * @param message - エラーメッセージ（任意） / Error message (optional)
   */
  constructor(message?: string) {
    super(message);
    this.name = "AuthRedirectError";
  }
}

/** サムネイル commit API の結果 / Result from the thumbnail commit API */
export interface CommitThumbnailResult {
  imageUrl: string;
  provider: string;
}

/** サムネイル commit API のオプション / Options for the thumbnail commit API */
export interface CommitThumbnailOptions {
  baseUrl: string;
  fallbackUrl?: string;
  title?: string;
}

const THUMBNAIL_COMMIT_TIMEOUT_MS = 15_000;

/**
 * 指定した sourceUrl の画像を POST /api/thumbnail/commit でストレージに保存する。
 * Cookie 認証を使用。401 時は AuthRedirectError、その他の失敗時は Error をスローする。
 *
 * Commits an image from sourceUrl to storage via POST /api/thumbnail/commit.
 * Uses cookie credentials. Throws AuthRedirectError on 401, Error on other failures.
 */
export async function commitThumbnailFromUrl(
  sourceUrl: string,
  options: CommitThumbnailOptions,
): Promise<CommitThumbnailResult> {
  const { baseUrl } = options;
  if (!baseUrl) {
    throw new Error("APIのURLが設定されていません");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), THUMBNAIL_COMMIT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/thumbnail/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({
        sourceUrl,
        fallbackUrl: options.fallbackUrl,
        title: options.title ?? "thumbnail",
      }),
    });
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      throw new Error("画像保存のリクエストがタイムアウトしました");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    throw new AuthRedirectError("ログインが必要です");
  }

  if (!response.ok) {
    let message = `画像の保存に失敗しました: ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      if (data?.message) message = data.message;
      else if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { imageUrl?: string; provider?: string };
  if (!data.imageUrl) throw new Error("画像のURLが取得できませんでした");
  return { imageUrl: data.imageUrl, provider: data.provider ?? "s3" };
}
