import { chunkForParams } from "../db/chunk";
import type { PageCursor } from "../db/cursor";
import type { SearchPlan } from "../db/searchPlan";
import type { PageListItem } from "../../shared/types";

import { addCost, type D1Cost } from "./cost";

export { newCost, type D1Cost } from "./cost";

/**
 * Lists a note's pages newest-first using keyset pagination on `pages_note_recent`.
 * `pages_note_recent` 索引を使うキーセット方式で新しい順に一覧する。
 */
export async function listPages(
  db: D1Database,
  noteId: string,
  cursor: PageCursor | null,
  limit: number,
  cost: D1Cost,
): Promise<{ items: PageListItem[]; next: PageCursor | null }> {
  const keyset = cursor ? "AND (updated_at, id) < (?3, ?4)" : "";
  const statement = db
    .prepare(
      `SELECT id, title, preview, updated_at AS updatedAt FROM pages
       WHERE note_id = ?1 ${keyset} ORDER BY updated_at DESC, id DESC LIMIT ?2`,
    )
    .bind(noteId, limit + 1, ...(cursor ? [cursor.updatedAt, cursor.id] : []));
  const result = await statement.all<PageListItem>();
  addCost(cost, result.meta);
  const items = result.results.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    next: result.results.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
  };
}

/**
 * Creates a page; FTS indexing and the note's page count are handled by triggers.
 * ページを作る。全文検索索引とページ数はトリガーが更新する。
 */
export async function createPage(
  db: D1Database,
  noteId: string,
  title: string,
  cost: D1Cost,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const result = await db
    .prepare(
      "INSERT INTO pages (id, note_id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
    )
    .bind(id, noteId, title, now)
    .run();
  addCost(cost, result.meta);
  return id;
}

/**
 * Searches pages in every note the user can access: FTS5 MATCH for long terms, LIKE for short ones.
 * アクセス可能な全ノートを検索する（長い語は FTS5、短い語は LIKE）。
 */
export async function searchPages(
  db: D1Database,
  userId: string,
  plan: SearchPlan,
  cost: D1Cost,
  limit = 20,
): Promise<PageListItem[]> {
  const params: unknown[] = [userId];
  const like = plan.likes.map((pattern) => {
    params.push(pattern);
    const n = params.length;
    return `AND (p.title LIKE ?${n} ESCAPE '\\' OR p.content_text LIKE ?${n} ESCAPE '\\')`;
  });
  const accessible = `p.note_id IN (SELECT id FROM notes WHERE owner_id = ?1 UNION SELECT note_id FROM note_members WHERE user_id = ?1)`;
  const columns = "p.id, p.title, p.preview, p.updated_at AS updatedAt";
  let sql: string;
  if (plan.match) {
    params.push(plan.match);
    sql = `SELECT ${columns} FROM pages_fts f JOIN pages p ON p.seq = f.rowid
           WHERE pages_fts MATCH ?${params.length} AND ${accessible} ${like.join(" ")}
           ORDER BY f.rank LIMIT ${limit}`;
  } else {
    sql = `SELECT ${columns} FROM pages p WHERE ${accessible} ${like.join(" ")}
           ORDER BY p.updated_at DESC LIMIT ${limit}`;
  }
  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<PageListItem>();
  addCost(cost, result.meta);
  return result.results;
}

const SUBJECTS = [
  "知識ネットワーク",
  "Durable Objects",
  "Cloudflare Workers",
  "読書メモ",
  "設計判断",
  "Hono",
  "Y.js",
  "週次レビュー",
];
const PHRASES = [
  "の要点を整理した",
  "について比較した",
  "を試した結果の",
  "に関する下書きの",
  "を読んで考えた",
];

/**
 * Development-only bulk insert used for load measurements: multi-row INSERTs chunked to
 * D1's 100-parameter limit, sent in batches (each batch is one transaction).
 * 計測用の一括投入（開発時のみ）。100 パラメータ上限で分割した複数行 INSERT をバッチ送信する。
 */
export async function seedPages(
  db: D1Database,
  noteId: string,
  count: number,
  cost: D1Cost,
): Promise<number> {
  const now = Date.now();
  const rows = Array.from({ length: count }, (_, i) => {
    const subject = SUBJECTS[i % SUBJECTS.length] as string;
    const phrase = PHRASES[i % PHRASES.length] as string;
    const text = `${subject}${phrase}メモ ${i}。WikiLink と タグ #seed${i % 50} を含む本文で、全文検索の計測に使う。`;
    return [
      crypto.randomUUID(),
      noteId,
      `${subject} ${i}`,
      text.slice(0, 120),
      text,
      now - i * 1000,
      now - i * 1000,
    ];
  });
  const statements = chunkForParams(rows, 7).map((chunk) =>
    db
      .prepare(
        `INSERT INTO pages (id, note_id, title, preview, content_text, created_at, updated_at) VALUES ${chunk
          .map(() => "(?, ?, ?, ?, ?, ?, ?)")
          .join(", ")}`,
      )
      .bind(...chunk.flat()),
  );
  for (let i = 0; i < statements.length; i += 100) {
    const results = await db.batch(statements.slice(i, i + 100));
    results.forEach((r) => addCost(cost, r.meta));
  }
  return rows.length;
}
