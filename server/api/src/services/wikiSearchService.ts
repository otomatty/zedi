/**
 * Wiki ページ ILIKE 検索サービス。
 *
 * `routes/search.ts` (`/api/search`) のページ検索ロジックを純粋関数として
 * 切り出したもの。Hono コンテキストへの依存を消し、tool / subgraph から
 * `db` / `userId` / `userEmail` を引数で受け取れるようにする。SQL は元 route
 * と一致させ、CodeRabbit / codex の review 指摘 (PR #873) が指す
 * - 「`content_text` を SELECT に晒さない」
 * - 「呼び出し元 default note への絞り込み」
 * - 「scope=shared での owner / accepted member / domain rule 結合」
 * をすべて踏襲する。
 *
 * Pure service version of the page-search branch in `routes/search.ts`. The
 * route remains the HTTP entry point, but tools (`wikiSearchTool` for the
 * Wiki Compose research subgraph, #949) need to query the same data set
 * without going through Hono context. The SQL itself is held identical to the
 * route so the previously-reviewed safety properties (no full body in SELECT,
 * domain-rule support, default-note scoping) carry over.
 */
import { sql } from "drizzle-orm";
import type { Database } from "../types/index.js";
import { extractEmailDomain } from "../lib/freeEmailDomains.js";
import { getDefaultNoteOrNull } from "./defaultNoteService.js";

/**
 * 検索スコープ。`own` は呼び出し元のデフォルトノート配下のページのみ、
 * `shared` はアクセス可能な全ノート横断（route のスコープ契約と同じ）。
 *
 * Scope contract mirrors `/api/search?scope=...`:
 * - `own`: pages under the caller's default note only.
 * - `shared`: pages across any note the caller can access (owner, accepted
 *   member, or domain rule).
 */
export type WikiSearchScope = "own" | "shared";

/**
 * 1 件の検索ヒット。ページ ID + ノート ID + タイトル + 抜粋。
 *
 * One search hit. snake_case is intentional in {@link Source} but here we use
 * camelCase to keep the service Pure-TS-shaped; the caller (tool / subgraph)
 * remaps to whatever wire format it wants.
 */
export interface WikiSearchHit {
  pageId: string;
  noteId: string;
  title: string | null;
  contentPreview: string | null;
  updatedAt: string;
}

/**
 * 内部用: ILIKE 用に `%` `_` `\` をエスケープする。
 *
 * Escape SQL LIKE meta-characters so user input is treated as a literal.
 */
function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * ユーザーの Wiki ページを ILIKE で検索する。空クエリは空配列を返す。
 *
 * Search the user's wiki pages by ILIKE. Empty query returns an empty array.
 * `limit` is clamped to 1..100 to match the route behaviour.
 *
 * @param db        Drizzle DB ハンドル。
 * @param userId    実行ユーザー ID。
 * @param userEmail 実行ユーザーのメール（`shared` スコープでドメインルール
 *                  予測子に使う。null なら domain predicate を出さない）。
 * @param query     検索クエリ。`%` / `_` は自動エスケープ。
 * @param scope     "own" or "shared"（既定 "shared"）。
 * @param limit     最大件数 (default 10, max 100)。
 */
export async function searchUserWikiPages(
  db: Database,
  userId: string,
  userEmail: string | null,
  query: string,
  scope: WikiSearchScope = "shared",
  limit = 10,
): Promise<WikiSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const pattern = `%${escapeLike(trimmed)}%`;

  // `content_text` を WHERE には残しつつ SELECT に出さない方針は route と同じ
  // (#873 review)。プレビューは `content_preview` カラムを返す。
  const searchColumns = sql`p.id, p.title, p.content_preview, p.updated_at, p.note_id`;

  if (scope === "own") {
    const defaultNote = await getDefaultNoteOrNull(db, userId);
    if (!defaultNote) return [];
    const result = await db.execute(sql`
      SELECT ${searchColumns}
      FROM pages p
      LEFT JOIN page_contents pc ON pc.page_id = p.id
      WHERE p.is_deleted = false
        AND p.note_id = ${defaultNote.id}
        AND (
          p.title ILIKE ${pattern}
          OR pc.content_text ILIKE ${pattern}
        )
      ORDER BY p.updated_at DESC
      LIMIT ${safeLimit}
    `);
    return result.rows.map(rowToHit);
  }

  const normalizedEmail = typeof userEmail === "string" ? userEmail.trim().toLowerCase() : "";
  const emailDomain = extractEmailDomain(normalizedEmail);

  const domainPredicate =
    emailDomain !== null
      ? sql`OR EXISTS (
          SELECT 1
          FROM notes n
          INNER JOIN note_domain_access nda ON nda.note_id = n.id
          WHERE n.id = p.note_id
            AND n.is_deleted = false
            AND nda.is_deleted = false
            AND nda.domain = ${emailDomain}
        )`
      : sql``;

  const result = await db.execute(sql`
    SELECT ${searchColumns}
    FROM pages p
    LEFT JOIN page_contents pc ON pc.page_id = p.id
    WHERE p.is_deleted = false
      AND (
        EXISTS (
          SELECT 1 FROM notes n
          WHERE n.id = p.note_id AND n.is_deleted = false AND n.owner_id = ${userId}
        )
        OR EXISTS (
          SELECT 1
          FROM notes n
          INNER JOIN note_members nm ON nm.note_id = n.id
          INNER JOIN "user" u ON LOWER(u.email) = LOWER(nm.member_email)
          WHERE n.id = p.note_id
            AND u.id = ${userId}
            AND nm.status = 'accepted'
            AND nm.is_deleted = false
            AND n.is_deleted = false
        )
        ${domainPredicate}
      )
      AND (
        p.title ILIKE ${pattern}
        OR pc.content_text ILIKE ${pattern}
      )
      ORDER BY p.updated_at DESC
      LIMIT ${safeLimit}
  `);
  return result.rows.map(rowToHit);
}

function rowToHit(row: unknown): WikiSearchHit {
  const r = row as {
    id: string;
    note_id: string;
    title: string | null;
    content_preview: string | null;
    updated_at: string;
  };
  return {
    pageId: r.id,
    noteId: r.note_id,
    title: r.title,
    contentPreview: r.content_preview,
    updatedAt: r.updated_at,
  };
}
