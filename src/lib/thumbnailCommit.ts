/**
 * Shared utility to commit an image from a URL to thumbnail storage via the API.
 * Used by useThumbnailCommit (editor) and WebClipperDialog.
 */

/** 401 時にサインインへリダイレクトするための印。catch 側で navigate("/sign-in") する。 */
export class AuthRedirectError extends Error {
  readonly redirectToSignIn = true;
  constructor(message?: string) {
    super(message);
    this.name = "AuthRedirectError";
  }
}

export interface CommitThumbnailResult {
  imageUrl: string;
  provider: string;
}

export interface CommitThumbnailOptions {
  baseUrl: string;
  fallbackUrl?: string;
  title?: string;
}

/**
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

  const response = await fetch(`${baseUrl}/api/thumbnail/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      sourceUrl,
      fallbackUrl: options?.fallbackUrl,
      title: options?.title ?? "thumbnail",
    }),
  });

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
