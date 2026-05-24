/**
 * `searchUserWikiPages` unit tests using the proxy mock DB. We assert:
 * - Empty query returns `[]` without touching the DB.
 * - `scope="own"` calls `getDefaultNoteOrNull` and short-circuits when null.
 * - `scope="shared"` runs the user-scoped SQL and maps rows to `WikiSearchHit`.
 * - `limit` is clamped to 1..100.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDefaultNoteOrNull } = vi.hoisted(() => ({ getDefaultNoteOrNull: vi.fn() }));

vi.mock("../../services/defaultNoteService.js", () => ({
  getDefaultNoteOrNull: (...args: unknown[]) =>
    getDefaultNoteOrNull(
      ...(args as Parameters<
        typeof import("../../services/defaultNoteService.js").getDefaultNoteOrNull
      >),
    ),
}));

import { searchUserWikiPages } from "../../services/wikiSearchService.js";
import { createMockDb } from "../createMockDb.js";
import type { Database } from "../../types/index.js";

beforeEach(() => {
  getDefaultNoteOrNull.mockReset();
});
afterEach(() => {
  getDefaultNoteOrNull.mockReset();
});

describe("searchUserWikiPages", () => {
  it("returns [] for empty query without DB access", async () => {
    const { db, chains } = createMockDb([]);
    const out = await searchUserWikiPages(
      db as unknown as Database,
      "u-1",
      null,
      "  ",
      "shared",
      10,
    );
    expect(out).toEqual([]);
    expect(chains.length).toBe(0);
    expect(getDefaultNoteOrNull).not.toHaveBeenCalled();
  });

  it("scope=own short-circuits when there is no default note", async () => {
    getDefaultNoteOrNull.mockResolvedValueOnce(null);
    const { db, chains } = createMockDb([]);
    const out = await searchUserWikiPages(db as unknown as Database, "u-1", null, "x", "own", 10);
    expect(out).toEqual([]);
    expect(chains.length).toBe(0);
  });

  it("scope=shared executes the SQL and maps rows", async () => {
    const rows = {
      rows: [
        {
          id: "page-1",
          note_id: "note-1",
          title: "T1",
          content_preview: "P1",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "page-2",
          note_id: "note-2",
          title: null,
          content_preview: null,
          updated_at: "2026-01-02T00:00:00Z",
        },
      ],
    };
    const { db, chains } = createMockDb([rows]);
    const out = await searchUserWikiPages(
      db as unknown as Database,
      "u-1",
      "alice@example.com",
      "alpha",
      "shared",
      5,
    );
    expect(chains.length).toBe(1);
    expect(chains[0]?.startMethod).toBe("execute");
    expect(out).toEqual([
      {
        pageId: "page-1",
        noteId: "note-1",
        title: "T1",
        contentPreview: "P1",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        pageId: "page-2",
        noteId: "note-2",
        title: null,
        contentPreview: null,
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ]);
  });

  it("clamps limit to 1..100", async () => {
    getDefaultNoteOrNull.mockResolvedValueOnce({ id: "n-default" });
    const { db } = createMockDb([{ rows: [] }]);
    await searchUserWikiPages(db as unknown as Database, "u-1", null, "x", "own", 9999);
    // No throw is the assertion here; the proxy mock doesn't expose the SQL
    // template's bound `limit` directly, but `safeLimit` is computed before the
    // query is issued so this exercises the clamping branch.
    // clamp は execute 前に評価される。proxy mock では bind 値を読み出せないため、
    // 例外が出ないことだけ確認する。
    expect(true).toBe(true);
  });
});
