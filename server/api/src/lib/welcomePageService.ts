/**
 * ウェルカムページ生成ロジック。
 * Welcome page generation logic.
 *
 * Tiptap JSON → Y.Doc 化して `pages` + `page_contents` に挿入し、
 * `user_onboarding_status.welcome_page_id` を更新する。セットアップ完了 API と
 * ログイン時リトライの両方から呼び出される。
 *
 * Converts the locale-appropriate Tiptap document to a Y.Doc and persists it
 * to `pages` + `page_contents`. Used by the onboarding completion endpoint
 * and by the login-time retry.
 */
import * as Y from "yjs";
import { getSchema } from "@tiptap/core";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { pages, pageContents, userOnboardingStatus } from "../schema/index.js";
import type { Database } from "../types/index.js";
import { VideoServer } from "./videoServerExtension.js";
import {
  welcomePageContent,
  WELCOME_PAGE_TITLE,
  resolveWelcomePageLocale,
  type WelcomePageLocale,
} from "../content/welcomePage/index.js";
import type { TiptapNode } from "./articleExtractor.js";

const YDOC_FRAGMENT = "default";

/**
 * ウェルカムページ用の Tiptap 拡張セット。Content JSON で使用するノード・マーク
 * （heading / paragraph / bulletList / listItem / bold / italic / code /
 * link / video）をカバーする最小限の拡張。
 *
 * Minimal Tiptap extension set covering the nodes and marks used by the
 * welcome page content (heading, paragraph, bulletList, listItem, bold,
 * italic, code, link, video).
 */
const welcomePageExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    // StarterKit は既定で link を含む。独自の Link 設定は別途行うため、
    // ここでは StarterKit 側を無効化して重複登録警告を避ける。
    // StarterKit v3 bundles `link`; disable it here so our own Link.configure
    // is the single source of truth and avoids the duplicate-extension warning.
    link: false,
  }),
  Link.configure({ openOnClick: false }),
  VideoServer,
];

/**
 * Tiptap スキーマはウェルカムページ生成のたびに組み立てる必要がない
 * （拡張セットは不変）。モジュールロード時に一度だけ `getSchema` を実行して
 * ウォームパスのコストを削減する。
 *
 * The Tiptap schema is invariant for welcome-page generation, so build it
 * once at module load instead of per call to keep the hot path cheap.
 */
const welcomePageSchema = getSchema(welcomePageExtensions);

/**
 * Drizzle のトランザクション型。サービスを route 側のトランザクションに参加
 * させるため型を抽出する。
 *
 * Drizzle transaction type, extracted so this service can join a route-level
 * transaction instead of opening its own.
 */
export type DbOrTx = Parameters<Parameters<Database["transaction"]>[0]>[0] | Database;

/**
 * ウェルカムページ生成結果。Welcome page generation result.
 */
export interface WelcomePageCreationResult {
  pageId: string;
  locale: WelcomePageLocale;
}

/**
 * Tiptap ドキュメントから content_preview 用のプレーンテキストを抜き出す。
 * Extracts plain text preview (max 200 chars) from a Tiptap document for
 * pages.content_preview.
 */
function extractPreviewText(doc: TiptapNode, maxLength = 200): string {
  const parts: string[] = [];
  const walk = (node: TiptapNode | undefined): void => {
    if (!node) return;
    if (typeof node.text === "string") {
      parts.push(node.text);
      return;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  };
  walk(doc);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * 生きている（未削除の）ウェルカムページが既にあればその ID と kind を返す。
 * DB 側の部分ユニーク index `idx_pages_unique_welcome_per_owner` と
 * 整合する、アプリケーションレイヤー側のルックアップ。
 *
 * Returns the existing live welcome page for the user, if any. Mirrors the
 * partial unique index `idx_pages_unique_welcome_per_owner` and lets callers
 * recover gracefully from concurrent inserts.
 */
async function findExistingWelcomePage(tx: DbOrTx, userId: string): Promise<string | null> {
  const rows = await tx
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.ownerId, userId), eq(pages.kind, "welcome"), eq(pages.isDeleted, false)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * トランザクション内でウェルカムページ 1 件を作成し、pages / page_contents を
 * 挿入する。既に `user_onboarding_status.welcome_page_id` が埋まっている場合、
 * または並行リクエストが先にウェルカムページを作っていた場合は null を返す
 * （べき等）。呼び出し側で `user_onboarding_status` の welcome_page_id と
 * welcome_page_created_at を更新すること。
 *
 * 並行安全性: pages への INSERT に `ON CONFLICT DO NOTHING` を付け、部分ユニーク
 * index `idx_pages_unique_welcome_per_owner` に衝突した場合は 0 行返す（例外で
 * トランザクションを abort させない）。0 行ならば既存のウェルカムページを
 * 再取得して ID を返す。
 *
 * Creates one welcome page inside the given transaction. Idempotent: returns
 * null when a welcome page already exists — either because
 * `user_onboarding_status.welcome_page_id` is set or a concurrent request
 * raced us.
 *
 * Concurrency: the pages INSERT uses `ON CONFLICT DO NOTHING` keyed on the
 * partial unique index `idx_pages_unique_welcome_per_owner`, so a racing
 * insert does not abort the transaction (as raising SQLSTATE 23505 would).
 * When the RETURNING set is empty we read back the existing welcome page and
 * return its id.
 *
 * @param tx - Drizzle transaction / Drizzle transaction
 * @param userId - 対象ユーザー / Target user ID
 * @param requestedLocale - 選択ロケール（不明時は ja フォールバック） /
 *                         User-selected locale (falls back to ja when unknown)
 */
export async function insertWelcomePage(
  tx: DbOrTx,
  userId: string,
  requestedLocale: string | null | undefined,
): Promise<WelcomePageCreationResult | null> {
  const existing = await tx
    .select({ welcomePageId: userOnboardingStatus.welcomePageId })
    .from(userOnboardingStatus)
    .where(eq(userOnboardingStatus.userId, userId))
    .limit(1);
  const existingRow = existing[0];
  if (existingRow?.welcomePageId) return null;

  const locale = resolveWelcomePageLocale(requestedLocale);
  const doc = welcomePageContent[locale];
  const title = WELCOME_PAGE_TITLE[locale];
  const contentPreview = extractPreviewText(doc);

  const ydoc = prosemirrorJSONToYDoc(welcomePageSchema, doc, YDOC_FRAGMENT);
  const ydocState = Y.encodeStateAsUpdate(ydoc);

  // 部分ユニーク index と同じ述語 (`kind='welcome' AND is_deleted=false`) を
  // ON CONFLICT に指定する。並行リクエストで衝突すると INSERT は 0 行返す。
  // Match the partial unique index predicate so a concurrent insert is a
  // no-op instead of aborting the transaction.
  const inserted = await tx
    .insert(pages)
    .values({
      ownerId: userId,
      title,
      contentPreview,
      kind: "welcome",
    })
    .onConflictDoNothing({
      target: pages.ownerId,
      where: sql`${pages.kind} = 'welcome' AND ${pages.isDeleted} = false`,
    })
    .returning({ id: pages.id });
  const page = inserted[0];
  if (!page) {
    // 並行リクエストが先に作成した。そのページを引いて返す。
    // Someone else inserted first; look up their page.
    const existingId = await findExistingWelcomePage(tx, userId);
    if (existingId) return { pageId: existingId, locale };
    throw new Error("Welcome page conflict but no existing page found");
  }

  await tx.insert(pageContents).values({
    pageId: page.id,
    ydocState: Buffer.from(ydocState),
    version: 1,
    contentText: contentPreview,
  });

  return { pageId: page.id, locale };
}

/**
 * ログイン時ベストエフォートリトライ。セットアップ完了済みでウェルカムページ
 * 未生成のユーザーに対し生成を再試行する。失敗時は飲み込んでログのみ出し、
 * 次回ログインで再試行する。
 *
 * Login-time best-effort retry. For users with setup_completed_at set but
 * welcome_page_created_at still null, try to create the welcome page. Errors
 * are logged but swallowed — the next login retries.
 */
export async function retryWelcomePageIfNeeded(db: Database, userId: string): Promise<void> {
  try {
    const pending = await db
      .select({
        userId: userOnboardingStatus.userId,
        requestedLocale: userOnboardingStatus.requestedLocale,
      })
      .from(userOnboardingStatus)
      .where(
        and(
          eq(userOnboardingStatus.userId, userId),
          isNotNull(userOnboardingStatus.setupCompletedAt),
          isNull(userOnboardingStatus.welcomePageCreatedAt),
        ),
      )
      .limit(1);
    const pendingRow = pending[0];
    if (!pendingRow) return;

    await db.transaction(async (tx) => {
      // ウィザードで選択されたロケールを尊重する。未保存時のみ `resolveWelcomePageLocale`
      // のデフォルト（ja）にフォールバックする。
      // Honor the locale the user originally picked; fall back to the resolver
      // default (`ja`) only when we never persisted one.
      const created = await insertWelcomePage(tx, userId, pendingRow.requestedLocale);
      if (!created) return;
      const now = new Date();
      await tx
        .update(userOnboardingStatus)
        .set({
          welcomePageCreatedAt: now,
          welcomePageId: created.pageId,
          updatedAt: now,
        })
        .where(eq(userOnboardingStatus.userId, userId));
    });
  } catch (error) {
    console.error("[welcomePageService] retry failed", { userId, error });
  }
}
