/**
 * サムネイル画像を URL からストレージへ保存する共通ユーティリティ。
 * useThumbnailCommit（エディタ）と WebClipperDialog から使用される。
 *
 * Shared utility to commit an image from a URL to thumbnail storage via the API.
 * Used by useThumbnailCommit (editor) and WebClipperDialog.
 */

import i18n from "@/i18n";

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

/**
 * 413 (STORAGE_QUOTA_EXCEEDED) 応答時に投げる例外。
 * 呼び出し側がアップグレード誘導 UI を出すために、通常のエラーから区別する。
 *
 * Thrown on 413 STORAGE_QUOTA_EXCEEDED responses so callers can surface an
 * upgrade prompt instead of the generic "save failed" toast.
 */
export class QuotaExceededError extends Error {
  readonly quotaExceeded = true;
  /**
   * 指定メッセージで QuotaExceededError を生成する。
   * Creates a QuotaExceededError with the given message.
   *
   * @param message - サーバーから返された人間可読メッセージ / Server-supplied message
   */
  constructor(message?: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** サムネイル commit API の結果 / Result from the thumbnail commit API */
export interface CommitThumbnailResult {
  imageUrl: string;
  /**
   * 保存された thumbnail_objects.id。ページ作成 API に渡して、ページ削除時の
   * GC に利用する。サーバが旧仕様で objectId を返さない場合は undefined。
   *
   * The persisted `thumbnail_objects.id`. Forwarded to the page creation API so
   * DELETE /pages/:id can GC the storage object. Undefined when the server is
   * an older build that doesn't return it.
   */
  objectId?: string;
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
 * 非OK応答の body をベストエフォートでパースして適切な Error を構築する。
 * 413 もしくは `code === "STORAGE_QUOTA_EXCEEDED"` の場合は QuotaExceededError、
 * それ以外は素の Error。
 *
 * Best-effort parse of a non-OK response body and surface the right error
 * class: `QuotaExceededError` for 413 / `code === "STORAGE_QUOTA_EXCEEDED"`,
 * generic `Error` otherwise.
 */
async function buildErrorFromFailedResponse(response: Response): Promise<Error> {
  let message = i18n.t("errors.imageSaveFailed", { status: response.status });
  let code: string | undefined;
  try {
    const data = (await response.json()) as { error?: string; message?: string; code?: string };
    if (data?.message) message = data.message;
    else if (data?.error) message = data.error;
    if (data?.code) code = data.code;
  } catch {
    // ignore parse errors
  }
  if (response.status === 413 || code === "STORAGE_QUOTA_EXCEEDED") {
    return new QuotaExceededError(message);
  }
  return new Error(message);
}

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
    throw new Error(i18n.t("errors.apiUrlNotConfigured"));
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
      throw new Error(i18n.t("errors.imageSaveTimeout"));
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    throw new AuthRedirectError(i18n.t("errors.loginRequired"));
  }

  if (!response.ok) {
    throw await buildErrorFromFailedResponse(response);
  }

  const data = (await response.json()) as {
    imageUrl?: string;
    objectId?: string;
    provider?: string;
  };
  if (!data.imageUrl) throw new Error(i18n.t("errors.imageUrlNotReturned"));
  return {
    imageUrl: data.imageUrl,
    objectId: data.objectId,
    provider: data.provider ?? "s3",
  };
}

const THUMBNAIL_DELETE_TIMEOUT_MS = 10_000;

/**
 * Web Clipper のような「サムネイル commit → ページ作成」フローで、ページ作成が
 * 失敗したときに事前にコミットしたサムネイルを巻き戻す。`DELETE /api/thumbnail/serve/:id`
 * を best-effort で叩き、失敗してもユーザー体験を壊さない（呼び出し元は throw
 * しないことを期待してよい）。
 *
 * レスポンス契約: 401（サインアウト中の rollback）、404（既に削除済みや並行 GC）、
 * 409（issue #820 の参照ガードがライブページの参照を理由に削除を拒否し blob を
 * 保存した phantom rollback ケース）はいずれも期待された no-op として静かに扱う。
 * 他の非 OK（500/429/403 等）はロールバック失敗としてログだけ残し、サーバ側の
 * スイーパーに孤立 blob の回収を委ねる。
 *
 * Best-effort rollback for the "commit thumbnail → create page" flow used by
 * the Web Clipper. When page creation fails after a successful thumbnail
 * commit, callers invoke this to avoid leaking an orphan that would otherwise
 * keep counting against the user's quota.
 *
 * Response contract: 401 (signed-out rollback), 404 (already deleted or
 * concurrent GC), and 409 (issue #820 referential guard preserved the blob
 * because a live page still references it — i.e. our rollback fired phantom
 * after a successful page commit) are all expected no-ops and produce no
 * warning. Anything else (500/429/403/...) is logged as an unexpected
 * rollback failure and left to the server-side sweeper to reclaim. The
 * function never throws.
 *
 * @param objectId - 削除対象の thumbnail_objects.id / Persisted thumbnail object id.
 * @param options - REST API のベース URL を含む設定 / Settings (currently just `baseUrl`).
 */
export async function deleteCommittedThumbnail(
  objectId: string,
  options: { baseUrl: string },
): Promise<void> {
  const { baseUrl } = options;
  if (!baseUrl || !objectId) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), THUMBNAIL_DELETE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/thumbnail/serve/${encodeURIComponent(objectId)}`, {
      method: "DELETE",
      credentials: "include",
      signal: controller.signal,
    });
    // 401 はサインアウト中の rollback、404 は既に削除済み（DELETE 自体や
    // サーバー側 GC 経由）の正常系。409 はサーバー側参照ガード (issue #820)
    // が「ライブページがまだ参照しているので消さない」と判定した結果で、
    // ロールバックが phantom 発火だった場合のあるべき挙動。それ以外の
    // 非 OK（500/429/403 など）はロールバック失敗としてログだけ残し、
    // サーバー側スイーパーに回収を委ねる。
    //
    // 401 means the user is signed out mid-rollback and 404 means the row is
    // already gone (e.g. concurrent delete or server-side GC) — both are
    // expected no-ops. 409 is the response from the server-side referential
    // guard (issue #820) when a live page still points at the thumbnail,
    // i.e. our rollback was a phantom and the server correctly preserved
    // the blob. Anything else (500/429/403/...) is an unexpected rollback
    // failure: log so it's visible, then fall through and let the server-side
    // sweeper reclaim the orphan.
    if (
      !response.ok &&
      response.status !== 401 &&
      response.status !== 404 &&
      response.status !== 409
    ) {
      console.warn(
        "[thumbnail/rollback] DELETE returned unexpected status:",
        response.status,
        response.statusText,
        objectId,
      );
    }
  } catch (err) {
    // ロールバックの失敗はサーバ側スイーパで回収可能なので、UX を壊さず警告だけ残す。
    // Rollback failures are reclaimable by the server-side sweeper, so log and move on.
    console.warn("Failed to roll back committed thumbnail:", err);
  } finally {
    clearTimeout(timeoutId);
  }
}
