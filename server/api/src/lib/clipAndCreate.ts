/**
 * clip-and-create: URL → fetch → Readability → Tiptap JSON → Y.Doc → DB
 *
 * Server-side web clipping pipeline for Chrome extension.
 * Chrome 拡張向けのサーバー側 Web クリッピングパイプライン。
 *
 * Since sub-issue otomatty/zedi#595 (Karpathy "LLM Wiki" ingest flow), the
 * URL → Tiptap JSON extraction is delegated to {@link extractArticleFromUrl}
 * so the ingest planner can reuse the same pipeline without DB writes.
 */
import * as Y from "yjs";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { pages, pageContents } from "../schema/index.js";
import type * as schema from "../schema/index.js";
import { buildArticleSchema, extractArticleFromUrl } from "./articleExtractor.js";

const YDOC_FRAGMENT = "default";

/**
 * クリップ作成結果。作成されたページの ID・タイトル・サムネイル URL。
 * Clip-and-create result: created page id, title, and optional thumbnail URL.
 *
 * @property page_id - 作成されたページの一意 ID。Created page unique ID.
 * @property title - ページタイトル。Page title.
 * @property thumbnail_url - サムネイル画像 URL（任意）。Optional thumbnail image URL.
 */
export interface ClipAndCreateResult {
  page_id: string;
  title: string;
  thumbnail_url?: string | null;
}

/**
 * クリップ作成の入力。URL・ユーザー ID・DB インスタンス。
 * Clip-and-create input: source URL, requesting user ID, and database instance.
 *
 * @property url - クリップするソース URL（http/https のみ許可）。Source URL to clip (http/https only).
 * @property userId - リクエストユーザー ID。Requesting user ID.
 * @property db - Drizzle NodePgDatabase インスタンス。Drizzle NodePgDatabase instance.
 */
export interface ClipAndCreateInput {
  url: string;
  userId: string;
  db: NodePgDatabase<typeof schema>;
}

/**
 * URL から HTML を取得し、Readability で本文を抽出して Tiptap JSON → Y.Doc 化し、DB にページを作成する。
 * Fetches HTML from URL, extracts content with Readability, converts to Tiptap JSON and Y.Doc, persists page to DB.
 *
 * @param input - クリップ対象 URL・ユーザー ID・DB。Source URL, userId, and db.
 * @returns 作成されたページの page_id, title, thumbnail_url。Created page metadata.
 * @throws URL が許可されていない、fetch 失敗、本文抽出失敗、DB エラー時に throw。Throws when URL disallowed, fetch fails, extraction fails, or DB error.
 */
export async function clipAndCreate(input: ClipAndCreateInput): Promise<ClipAndCreateResult> {
  const { url, userId, db } = input;

  const article = await extractArticleFromUrl({ url });

  const tiptapSchema = buildArticleSchema();
  const ydoc = prosemirrorJSONToYDoc(tiptapSchema, article.tiptapJson, YDOC_FRAGMENT);
  const ydocState = Y.encodeStateAsUpdate(ydoc);
  const ydocBase64 = Buffer.from(ydocState).toString("base64");

  const result = await db.transaction(async (tx) => {
    const [page] = await tx
      .insert(pages)
      .values({
        ownerId: userId,
        title: article.title,
        contentPreview: article.contentText || null,
        sourceUrl: article.finalUrl,
        thumbnailUrl: article.thumbnailUrl ?? null,
      })
      .returning({ id: pages.id });

    if (!page) throw new Error("Failed to create page");

    await tx.insert(pageContents).values({
      pageId: page.id,
      ydocState: Buffer.from(ydocBase64, "base64"),
      version: 1,
      contentText: article.contentText || null,
    });

    return { page, title: article.title, thumbnailUrl: article.thumbnailUrl };
  });

  return {
    page_id: result.page.id,
    title: result.title,
    thumbnail_url: result.thumbnailUrl ?? null,
  };
}
