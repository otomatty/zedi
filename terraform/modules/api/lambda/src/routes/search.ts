/**
 * /api/search — 全文検索
 *
 * GET /api/search?q=&scope= — pg_bigm による全文検索
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { sql } from 'drizzle-orm';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

app.get('/', authRequired, async (c) => {
  const userId = c.get('userId');
  const db = c.get('db');

  const query = c.req.query('q')?.trim();
  if (!query) {
    return c.json({ results: [] });
  }

  const scope = c.req.query('scope') || 'own';
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100);

  // pg_bigm 全文検索
  // scope: 'own' = 自分のページのみ, 'shared' = ノート経由の共有ページも含む
  let results;

  if (scope === 'shared') {
    results = await db.execute(sql`
      SELECT p.id, p.title, p.content_preview, p.updated_at,
             pc.content_text,
             likequery(${query}) AS search_query
      FROM pages p
      LEFT JOIN page_contents pc ON pc.page_id = p.id
      WHERE p.is_deleted = false
        AND (
          p.owner_id = CAST(${userId} AS uuid)
          OR p.id IN (
            SELECT np.page_id FROM note_pages np
            JOIN note_members nm ON nm.note_id = np.note_id
            WHERE nm.member_email IN (
              SELECT email FROM users WHERE id = CAST(${userId} AS uuid)
            )
            AND nm.is_deleted = false
            AND np.is_deleted = false
          )
        )
        AND (
          p.title LIKE '%' || likequery(${query}) || '%'
          OR pc.content_text LIKE '%' || likequery(${query}) || '%'
        )
      ORDER BY p.updated_at DESC
      LIMIT ${limit}
    `);
  } else {
    results = await db.execute(sql`
      SELECT p.id, p.title, p.content_preview, p.updated_at,
             pc.content_text
      FROM pages p
      LEFT JOIN page_contents pc ON pc.page_id = p.id
      WHERE p.is_deleted = false
        AND p.owner_id = CAST(${userId} AS uuid)
        AND (
          p.title LIKE '%' || likequery(${query}) || '%'
          OR pc.content_text LIKE '%' || likequery(${query}) || '%'
        )
      ORDER BY p.updated_at DESC
      LIMIT ${limit}
    `);
  }

  return c.json({ results });
});

export default app;
