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
import { and, eq, isNull, isNotNull } from "drizzle-orm";
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
 * トランザクション内でウェルカムページ 1 件を作成し、pages / page_contents を
 * 挿入する。既に `user_onboarding_status.welcome_page_id` が埋まっている場合は
 * 何もせず null を返す（べき等）。呼び出し側で `user_onboarding_status` の
 * welcome_page_id・welcome_page_created_at を更新すること。
 *
 * Creates one welcome page inside the given transaction (inserts pages and
 * page_contents). Idempotent: returns null if a welcome_page_id is already
 * recorded for this user. The caller is responsible for upserting
 * `user_onboarding_status.welcome_page_id` / `.welcome_page_created_at`.
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

  const schema = getSchema(welcomePageExtensions);
  const ydoc = prosemirrorJSONToYDoc(schema, doc, YDOC_FRAGMENT);
  const ydocState = Y.encodeStateAsUpdate(ydoc);

  const [page] = await tx
    .insert(pages)
    .values({
      ownerId: userId,
      title,
      contentPreview,
      kind: "welcome",
    })
    .returning({ id: pages.id });
  if (!page) throw new Error("Failed to insert welcome page");

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
    if (pending.length === 0) return;

    await db.transaction(async (tx) => {
      const created = await insertWelcomePage(tx, userId, null);
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
