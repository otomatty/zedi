/**
 * `routes/notes/helpers.ts` の `getNoteRole` ロジックテスト。
 *
 * Unit tests for the role-resolution order implemented in `helpers.ts`
 * (issue #663). The mock DB from `setup.ts` returns results by call order,
 * so each query consumes one slot:
 *   1. findActiveNoteById
 *   2. noteMembers lookup (when email present)
 *   3. noteDomainAccess lookup (when no member match)
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

describe("getNoteRole — resolution order (issue #663)", () => {
  it("returns null role when the note does not exist", async () => {
    const { db } = createMockDb([[]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.note).toBeNull();
    expect(result.role).toBeNull();
  });

  it("returns 'owner' when caller owns the note (short-circuits later checks)", async () => {
    const { db } = createMockDb([[mockNoteRow()]]);
    const result = await getNoteRole(
      NOTE_ID,
      OWNER_ID,
      "owner@example.com",
      db as unknown as Database,
    );
    expect(result.role).toBe("owner");
  });

  it("returns member role when the caller is an accepted member (wins over domain rule)", async () => {
    // owner > member の後、member にヒットしたら domain のチェックはしない。
    // After the member hit, the domain query must not fire (member > domain).
    const { db } = createMockDb([
      [mockNoteRow()],
      [{ role: "editor" }], // noteMembers → accepted editor
    ]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("editor");
  });

  it("returns domain role when member check is empty and a rule matches", async () => {
    // member 無し → domain ルールでヒット。editor として返る。
    // No member, but a domain rule matches — returns editor.
    const { db } = createMockDb([
      [mockNoteRow()],
      [], // noteMembers → empty
      [{ role: "editor" }], // noteDomainAccess → editor rule
    ]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("editor");
  });

  it("picks the strongest domain role when multiple rules match (editor > viewer)", async () => {
    const { db } = createMockDb([
      [mockNoteRow()],
      [], // noteMembers → empty
      [{ role: "viewer" }, { role: "editor" }], // multiple rules
    ]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("editor");
  });

  it("matches the domain case-insensitively via the normalized email", async () => {
    // `visitor@EXAMPLE.COM` でもルールに一致する。
    // Upper-cased email domains must still resolve.
    const { db } = createMockDb([
      [mockNoteRow()],
      [], // noteMembers → empty
      [{ role: "viewer" }],
    ]);
    const result = await getNoteRole(
      NOTE_ID,
      VISITOR_ID,
      "visitor@EXAMPLE.COM",
      db as unknown as Database,
    );
    expect(result.role).toBe("viewer");
  });

  it("falls through to 'guest' for public notes when no member or domain match", async () => {
    const { db } = createMockDb([
      [mockNoteRow({ visibility: "public" })],
      [], // noteMembers → empty
      [], // noteDomainAccess → empty
    ]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBe("guest");
  });

  it("returns null for private notes when nothing matches", async () => {
    const { db } = createMockDb([
      [mockNoteRow()],
      [], // noteMembers → empty
      [], // noteDomainAccess → empty
    ]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, VISITOR_EMAIL, db as unknown as Database);
    expect(result.role).toBeNull();
  });

  it("skips member/domain checks when email is missing (still returns guest for public)", async () => {
    // email 無しだと member / domain の問い合わせを発行しない。
    // Without an email, skip member and domain queries entirely.
    const { db } = createMockDb([[mockNoteRow({ visibility: "public" })]]);
    const result = await getNoteRole(NOTE_ID, VISITOR_ID, undefined, db as unknown as Database);
    expect(result.role).toBe("guest");
  });
});
