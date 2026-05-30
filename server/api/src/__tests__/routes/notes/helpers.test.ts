/**
 * `routes/notes/helpers.ts` の `getNoteRole` ロジックテスト。
 *
 * Unit tests for the role-resolution order implemented in `helpers.ts`
 * (issue #663). `getNoteRole` は note 行・メンバーロール・ドメインロールを
 * 1 クエリ（相関サブクエリ）で取得するため、モック DB は 1 スロットだけを
 * 消費する: `[{ note, memberRole, domainRole }]`。
 *
 * `getNoteRole` resolves the note row plus the caller's member/domain roles in
 * a single query (correlated subqueries), so the mock DB consumes exactly one
 * slot: `[{ note, memberRole, domainRole }]`.
 *
 * 解決順: owner > member > domain access > visibility > none.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

// `setup.ts` は noteRoutes を取り込むため、middleware/auth 経由で
// `src/auth.ts` → `src/db/client.ts` が初期化され DATABASE_URL を要求する。
// ルート系テストと同様に auth ミドルウェアを無害なスタブへ差し替える。
//
// Importing `setup.ts` pulls in the note routes, which chain through
// `middleware/auth.ts` → `auth.ts` → `db/client.ts` and end up requiring
// `DATABASE_URL`. Stub the auth module the same way the route tests do so
// this helper-only suite doesn't need a real DB.
vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    await next();
  },
  authOptional: async (c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

import { getNoteRole } from "../../../routes/notes/helpers.js";
import type { Database } from "../../../types/index.js";
import { createMockDb } from "./setup.js";

const NOTE_ID = "note-test-001";
const OWNER_ID = "user-owner";
const VISITOR_ID = "user-visitor";
const VISITOR_EMAIL = "visitor@example.com";

/**
 * Factory for a note row that defaults to a private note owned by `user-owner`.
 * `user-owner` 所有の private ノート行のデフォルトモック。
 */
function mockNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    ownerId: OWNER_ID,
    title: "Test",
    visibility: "private",
    editPermission: "owner_only",
    isOfficial: false,
    viewCount: 0,
    createdAt: new Date("2026-04-20T00:00:00Z"),
    updatedAt: new Date("2026-04-20T00:00:00Z"),
    isDeleted: false,
    ...overrides,
  };
}

/**
 * `getNoteRole` が消費する combined 行を組み立てる。note 列はフラットに展開し、
 * memberRole / domainRole を併せ持つ（本番クエリの select 形に合わせる）。
 * Builds the combined row consumed by `getNoteRole`: note columns are flattened
 * with memberRole / domainRole alongside them, matching the production select.
 */
function mockRoleRow(
  overrides: {
    note?: Record<string, unknown>;
    memberRole?: "viewer" | "editor" | null;
    domainRole?: "viewer" | "editor" | null;
  } = {},
) {
  return {
    ...mockNoteRow(overrides.note ?? {}),
    memberRole: overrides.memberRole ?? null,
    domainRole: overrides.domainRole ?? null,
  };
}

describe("getNoteRole — resolution order (issue #663)", () => {
  it("issues a single DB round trip", async () => {
    const { db, chains } = createMockDb([[mockRoleRow()]]);
    await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(chains.length).toBe(1);
  });

  it("returns null role when the note does not exist", async () => {
    const { db } = createMockDb([[]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.note).toBeNull();
    expect(result.role).toBeNull();
  });

  it("returns 'owner' when caller owns the note (outranks member/domain)", async () => {
    // owner はメンバー / ドメインのロールが乗っていても最優先で勝つ。
    // Owner wins even if member/domain roles are also present on the row.
    const { db } = createMockDb([[mockRoleRow({ memberRole: "editor", domainRole: "editor" })]]);
    const result = await getNoteRole(
      NOTE_ID,
      OWNER_ID,
      "owner@example.com",
      db as unknown as Database,
    );
    expect(result.role).toBe("owner");
  });

  it("returns member role when the caller is an accepted member (wins over domain rule)", async () => {
    // member にヒットしたら domain より優先される（明示的に昇格済み）。
    // A member match outranks any domain rule.
    const { db } = createMockDb([
      [mockRoleRow({ note: { ownerId: OWNER_ID }, memberRole: "editor", domainRole: "viewer" })],
    ]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("editor");
  });

  it("returns domain role when there is no member match", async () => {
    // member 無し → domain ロール（SQL 側で最強ロールを集約済み）を返す。
    // No member; returns the domain role (strongest role aggregated in SQL).
    const { db } = createMockDb([[mockRoleRow({ memberRole: null, domainRole: "editor" })]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("editor");
  });

  it("returns the viewer domain role when that is the strongest match", async () => {
    const { db } = createMockDb([[mockRoleRow({ memberRole: null, domainRole: "viewer" })]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("viewer");
  });

  it("falls through to 'guest' for public notes when no member or domain match", async () => {
    const { db } = createMockDb([[mockRoleRow({ note: { visibility: "public" } })]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("guest");
  });

  it("falls through to 'guest' for unlisted notes", async () => {
    const { db } = createMockDb([[mockRoleRow({ note: { visibility: "unlisted" } })]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("guest");
  });

  it("returns null for private notes when nothing matches", async () => {
    const { db } = createMockDb([[mockRoleRow()]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBeNull();
  });

  it("returns guest for public notes even when the email is missing", async () => {
    const { db } = createMockDb([[mockRoleRow({ note: { visibility: "public" } })]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, undefined, db as unknown as Database);
    expect(result.role).toBe("guest");
  });
});
