/**
 * GET /api/notes/me — デフォルトノート（マイノート）取得エンドポイントのテスト。
 * Tests for `GET /api/notes/me`, the default-note landing endpoint.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
  authOptional: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (userId) c.set("userId", userId);
    await next();
  },
}));

import { TEST_USER_ID, createMockNote, createTestApp, authHeaders } from "./setup.js";

describe("GET /api/notes/me", () => {
  it("returns the existing default note with snake_case fields", async () => {
    // Given: 既存のデフォルトノートがある場合、ensureDefaultNote の SELECT で
    // 行が返るので INSERT/再 SELECT は走らない。ハンドラはその行をそのまま返す。
    // When a default note exists, ensureDefaultNote's SELECT returns it, no
    // INSERT or extra round-trip is needed, and the handler returns it as-is.
    const defaultNote = createMockNote({
      id: "note-default-001",
      title: "テストユーザーのノート",
      isDefault: true,
    });

    const { app } = createTestApp([
      [defaultNote], // ensureDefaultNote → getDefaultNoteOrNull
    ]);

    const res = await app.request("/api/notes/me", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(defaultNote.id);
    expect(body.is_default).toBe(true);
    expect(body.title).toBe("テストユーザーのノート");
    expect(body.owner_id).toBe(TEST_USER_ID);
    expect(body.visibility).toBe("private");
    expect(body.edit_permission).toBe("owner_only");
  });

  it("creates the default note on first access and returns it", async () => {
    // Given: 初回アクセスで `notes.is_default=true` の行は無い → users.name から
    // タイトルを組み立てて INSERT、`returning()` で全カラムが返る。
    // First-time path: no default note yet → ensureDefaultNote reads
    // users.name and INSERTs RETURNING the full row.
    const newDefault = createMockNote({
      id: "note-default-new",
      title: "山田のノート",
      isDefault: true,
    });

    const { app } = createTestApp([
      [], // ensureDefaultNote → getDefaultNoteOrNull (none)
      [{ name: "山田" }], // ensureDefaultNote → users select
      [newDefault], // ensureDefaultNote → INSERT returning full row
    ]);

    const res = await app.request("/api/notes/me", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(newDefault.id);
    expect(body.is_default).toBe(true);
    expect(body.title).toBe("山田のノート");
  });

  it("returns 401 when not authenticated", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/notes/me", {
      method: "GET",
    });

    expect(res.status).toBe(401);
  });
});
