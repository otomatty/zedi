/**
 * `middleware/adminAuth.ts` のユニットテスト。
 *
 * - 未認証 (userId なし) は 401 を返す。
 * - DB 上の role が "admin" 以外なら 403 を返す。
 * - role が "admin" のときのみ next() に進み、後続ハンドラが呼ばれる。
 *
 * Unit tests for the `adminRequired` Hono middleware.
 * Verifies that unauthenticated requests get 401, non-admin roles get 403,
 * and only admins are allowed past to the route handler.
 */
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { adminRequired } from "../../middleware/adminAuth.js";

type MockRoleRow = { role: "user" | "admin" };

/**
 * Build a minimal Drizzle-style DB double whose
 * `select().from().where().limit()` resolves with the given rows.
 * テスト用に最小限の Drizzle 風 DB を作る。
 */
function createMockDb(roleRows: MockRoleRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => roleRows,
        }),
      }),
    }),
  } as unknown as AppEnv["Variables"]["db"];
}

/**
 * Build a Hono app that wires `userId` and the mocked DB into context,
 * then mounts a single `/admin` route guarded by `adminRequired`.
 * `adminRequired` を装着した最小の Hono アプリを生成する。
 */
type RouteHandlerFn = () => { ok: boolean };

function createApp(opts: { userId?: string; rows?: MockRoleRow[]; handler?: RouteHandlerFn }) {
  const app = new Hono<AppEnv>();
  const handler = vi.fn<RouteHandlerFn>(opts.handler ?? (() => ({ ok: true })));
  app.use("*", async (c, next) => {
    if (opts.userId !== undefined) c.set("userId", opts.userId);
    c.set("db", createMockDb(opts.rows ?? []));
    await next();
  });
  app.get("/admin", adminRequired, (c) => c.json(handler()));
  return { app, handler };
}

describe("adminRequired", () => {
  it("returns 401 when userId is not set in context (unauthenticated)", async () => {
    // authRequired が走っていない場合は 401 を返さなければならない。
    // adminRequired must reject when authRequired hasn't populated userId.
    const { app, handler } = createApp({ rows: [{ role: "admin" }] });
    const res = await app.request("/admin");
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    // HTTPException without an onError serializes the message as plain text.
    // onError 未登録時の HTTPException は本文がテキストになるため text() を使う。
    const body = await res.text();
    expect(body).toMatch(/authentication required/i);
  });

  it("returns 403 when the user has role='user'", async () => {
    const { app, handler } = createApp({ userId: "u-1", rows: [{ role: "user" }] });
    const res = await app.request("/admin");
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    const body = await res.text();
    expect(body).toMatch(/admin access required/i);
  });

  it("returns 403 when the user does not exist (no row returned)", async () => {
    // ユーザーが削除済み / 不在のときは role が null として扱われ、403 になる。
    // A missing user row should not be treated as admin.
    const { app, handler } = createApp({ userId: "u-missing", rows: [] });
    const res = await app.request("/admin");
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the route handler exactly once when role='admin'", async () => {
    const { app, handler } = createApp({ userId: "u-admin", rows: [{ role: "admin" }] });
    const res = await app.request("/admin");
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("does NOT query the DB when userId is missing", async () => {
    // 401 ショートサーキット時に DB を引かないことを確認する。
    // Verify the DB lookup is short-circuited before role resolution.
    const selectSpy = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ role: "admin" }],
        }),
      }),
    }));
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", { select: selectSpy } as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.get("/admin", adminRequired, (c) => c.json({ ok: true }));
    const res = await app.request("/admin");
    expect(res.status).toBe(401);
    expect(selectSpy).not.toHaveBeenCalled();
  });
});
