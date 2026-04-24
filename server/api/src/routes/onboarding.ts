/**
 * /api/onboarding — セットアップウィザード完了エンドポイント
 * /api/onboarding — setup wizard completion endpoint
 *
 * POST /api/onboarding/complete
 *   プロフィール更新 + セットアップ完了フラグ + ウェルカムページ生成を
 *   1 トランザクションで処理する。呼び出し側（フロントエンド）はこの API を
 *   1 回呼ぶだけでウィザードを完了できる。
 *
 *   Atomically updates the user profile, records the setup-completed
 *   timestamp, and creates the welcome page. A single call from the wizard
 *   drives the whole completion flow.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, sql } from "drizzle-orm";
import { users, userOnboardingStatus } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";
import { insertWelcomePage, retryWelcomePageIfNeeded } from "../lib/welcomePageService.js";

const app = new Hono<AppEnv>();

/** 入力バリデーションエラーを 400 で返すヘルパー。Throws 400 on invalid input. */
function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

app.post("/complete", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  // JSON 解析失敗と型の食い違いを 500 ではなく 400 として返すため、
  // `c.req.json()` を try/catch で囲み、各フィールドに typeof ガードを入れる。
  // Wrap `c.req.json()` so malformed JSON becomes 400, and typeof-guard every
  // field so `{"display_name": 123}` does not blow up on `.trim()`.
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    badRequest("invalid JSON body");
  }
  if (!rawBody || typeof rawBody !== "object") {
    badRequest("invalid request body");
  }
  const body = rawBody as {
    display_name?: unknown;
    avatar_url?: unknown;
    locale?: unknown;
  };

  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!displayName) badRequest("display_name is required");
  if (displayName.length > 120) badRequest("display_name is too long");

  const avatarUrl =
    typeof body.avatar_url === "string" && body.avatar_url.trim().length > 0
      ? body.avatar_url.trim()
      : null;
  const locale = typeof body.locale === "string" ? body.locale : null;
  // requested_locale には ja/en のどちらかだけを永続化（null は "未選択"）。
  // CHECK 制約に揃え、リトライ時の再現性を担保する。
  // Persist only ja/en for requested_locale (null = unspecified). Matches the
  // DB CHECK constraint and makes retries deterministic.
  const normalizedLocale: "ja" | "en" | null =
    locale === "en" ? "en" : locale === "ja" ? "ja" : null;

  const result = await db.transaction(async (tx) => {
    // 1. users テーブルのプロフィールを更新する。better-auth 経由のキャッシュは
    //    最大 5 分で refresh されるため、次回セッション読み込み時に新しい値が
    //    反映される。
    //    Update the users row. Better Auth's cookie cache refreshes within
    //    ~5 minutes, so the new values surface on the next session load.
    await tx
      .update(users)
      .set({
        name: displayName,
        image: avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // 2. ウェルカムページを生成（まだ無い場合）。requested_locale と同じ
    //    正規化値を渡し、リトライ時との整合性を担保する。
    //    Generate the welcome page if one does not yet exist. Pass the already
    //    normalized locale so a later retry — which reads `requested_locale`
    //    verbatim — produces the same language.
    const welcome = await insertWelcomePage(tx, userId, normalizedLocale);

    // 3. user_onboarding_status を upsert。setup_completed_at は今回初めて
    //    確定し、welcome_page_id はページ生成時のみ上書きする（既存ページが
    //    あれば welcome は null で、既存レコードを尊重する）。
    //    Upsert user_onboarding_status. setup_completed_at is set here for
    //    the first time; welcome_page_id is only assigned when we actually
    //    created a new welcome page (otherwise the existing row is preserved).
    const now = new Date();
    const baseValues = {
      userId,
      setupCompletedAt: now,
      requestedLocale: normalizedLocale,
      updatedAt: now,
    };
    const withPage = welcome
      ? {
          ...baseValues,
          welcomePageCreatedAt: now,
          welcomePageId: welcome.pageId,
        }
      : baseValues;

    await tx
      .insert(userOnboardingStatus)
      .values(withPage)
      .onConflictDoUpdate({
        target: userOnboardingStatus.userId,
        set: {
          // `setupCompletedAt` は「初回完了時刻」を保持する値なので、
          // 既存レコードの値がある場合は上書きしない（ユーザーが完了 API を
          // 複数回叩いても初回時刻は保たれる）。
          // Preserve the first completion time: existing values win over `now`.
          setupCompletedAt: sql`COALESCE(${userOnboardingStatus.setupCompletedAt}, ${now})`,
          // requested_locale は「初回選択」を優先。空なら今回のリクエストで埋める。
          // Prefer the first-captured locale; backfill only when still null.
          requestedLocale: sql`COALESCE(${userOnboardingStatus.requestedLocale}, ${normalizedLocale})`,
          updatedAt: now,
          ...(welcome
            ? {
                welcomePageCreatedAt: now,
                welcomePageId: welcome.pageId,
              }
            : {}),
        },
      });

    // 最終状態を 1 行読み返してレスポンスに含める。
    // Read the final row so the response includes the canonical state.
    const finalRow = await tx
      .select()
      .from(userOnboardingStatus)
      .where(eq(userOnboardingStatus.userId, userId))
      .limit(1);

    return {
      row: finalRow[0],
      welcome,
    };
  });

  const row = result.row;
  if (!row) {
    throw new HTTPException(500, { message: "Failed to record onboarding status" });
  }

  return c.json(
    {
      setup_completed_at: row.setupCompletedAt?.toISOString() ?? null,
      welcome_page_id: row.welcomePageId ?? null,
      welcome_page_created_at: row.welcomePageCreatedAt?.toISOString() ?? null,
      welcome_page_locale: result.welcome?.locale ?? null,
    },
    200,
  );
});

/**
 * GET /api/onboarding/status — 呼び出し元ユーザーのオンボーディング状況を返す。
 * Returns the caller's onboarding status. Used to decide whether to show the
 * setup wizard and/or re-trigger welcome page creation.
 */
app.get("/status", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  // ログイン時のベストエフォートリトライ: セットアップ完了済みでウェルカム
  // ページが未生成のユーザーを拾って生成する。失敗しても status 応答は返す。
  // Login-time best-effort retry: regenerate the welcome page if the user
  // previously completed setup but welcome page creation failed.
  await retryWelcomePageIfNeeded(db, userId);

  const rows = await db
    .select()
    .from(userOnboardingStatus)
    .where(eq(userOnboardingStatus.userId, userId))
    .limit(1);
  const row = rows[0];

  return c.json({
    setup_completed_at: row?.setupCompletedAt?.toISOString() ?? null,
    welcome_page_id: row?.welcomePageId ?? null,
    welcome_page_created_at: row?.welcomePageCreatedAt?.toISOString() ?? null,
    home_slides_shown_at: row?.homeSlidesShownAt?.toISOString() ?? null,
    auto_create_update_notice: row?.autoCreateUpdateNotice ?? true,
  });
});

export default app;
