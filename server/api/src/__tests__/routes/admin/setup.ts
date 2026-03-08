/**
 * 管理 API テスト用セットアップ
 *
 * vi.mock はテストファイル側に記述する（auth / adminAuth）。
 * このファイルはモック DB とルートマウント用の createAdminTestApp を提供する。
 */
import { Hono } from "hono";
import type { AppEnv } from "../../../types/index.js";
import adminRoutes from "../../../routes/admin/index.js";
import { createMockDb } from "../notes/setup.js";

export const TEST_ADMIN_ID = "user-admin-001";
export const TEST_ADMIN_EMAIL = "admin@example.com";

/** GET /users の select で返す行の形（camelCase） */
export function createMockUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-target-001",
    name: "Test User",
    email: "user@example.com",
    role: "user" as const,
    createdAt: new Date("2026-01-15T00:00:00Z"),
    ...overrides,
  };
}

/**
 * 管理ルート用テストアプリ。
 * dbResults の並び: 各リクエストで adminRequired が 1 回 select するので、
 * 先頭に [{ role: 'admin' }] を置き、続けてハンドラ内のクエリ結果を並べる。
 *
 * 例 GET /users:
 *   [ adminRoleCheck, listRows, countRow ]
 * 例 PATCH /users/:id:
 *   [ adminRoleCheck, updateReturning ]
 */
export function createAdminTestApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });

  app.route("/api/admin", adminRoutes);
  return { app, chains };
}

export function adminAuthHeaders(userId = TEST_ADMIN_ID, userEmail = TEST_ADMIN_EMAIL) {
  return {
    "x-test-user-id": userId,
    "x-test-user-email": userEmail,
    "Content-Type": "application/json",
  };
}
