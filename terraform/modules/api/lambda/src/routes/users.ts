/**
 * /api/users — ユーザー CRUD
 *
 * POST /api/users/upsert  — Cognito ユーザー Upsert
 * GET  /api/users/:id      — ユーザー取得
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { users } from '../schema';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

// ── POST /users/upsert ─────────────────────────────────────────────────────
app.post('/upsert', authRequired, async (c) => {
  const body = await c.req.json<{
    cognito_sub?: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
  }>();

  const cognitoSub = body.cognito_sub || c.get('cognitoSub');
  const email = body.email;

  if (!cognitoSub || !email) {
    throw new HTTPException(400, { message: 'cognito_sub and email are required' });
  }

  const db = c.get('db');

  // UPSERT: INSERT ... ON CONFLICT ... DO UPDATE
  const result = await db
    .insert(users)
    .values({
      cognitoSub,
      email,
      displayName: body.display_name || null,
      avatarUrl: body.avatar_url || null,
    })
    .onConflictDoUpdate({
      target: users.cognitoSub,
      set: {
        email,
        displayName: body.display_name || undefined,
        avatarUrl: body.avatar_url || undefined,
        updatedAt: new Date(),
      },
    })
    .returning();

  return c.json({ user: result[0] }, 200);
});

// ── GET /users/:id ──────────────────────────────────────────────────────────
app.get('/:id', authRequired, async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!result.length) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return c.json({ user: result[0] });
});

export default app;
