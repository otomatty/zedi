/**
 * defaultNoteService の単体テスト。タイトル整形と冪等な保証ロジックを検証する。
 * Unit tests for defaultNoteService: title formatting and idempotent ensure.
 */
import { describe, it, expect } from "vitest";
import {
  ensureDefaultNote,
  formatDefaultNoteTitle,
  getDefaultNoteOrNull,
} from "./defaultNoteService.js";

// ── Mock DB helper (shared with other service tests) ───────────────────────

/**
 * `queryResults[i]` が i 番目に発行されたクエリの戻り値になる、最小プロキシ DB。
 * Minimal proxy DB whose i-th query returns `queryResults[i]`. Mirrors the
 * pattern in `invitationService.test.ts`.
 */
function createMockDb(queryResults: unknown[]) {
  let queryIndex = 0;
  return new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
    get(_target, _prop: string) {
      return (..._args: unknown[]) => {
        const idx = queryIndex++;
        const result = queryResults[idx];
        return makeChainProxy(result);
      };
    },
  });
}

function makeChainProxy(result: unknown): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (prop === "then") {
        return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      if (prop === "catch") {
        return (reject?: (e: unknown) => unknown) => Promise.resolve(result).catch(reject);
      }
      if (prop === "finally") {
        return (fn?: () => void) => Promise.resolve(result).finally(fn);
      }
      return (..._args: unknown[]) => makeChainProxy(result);
    },
  });
}

function buildNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-default-001",
    ownerId: "user-1",
    title: "山田のノート",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: true,
    viewCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    isDeleted: false,
    ...overrides,
  };
}

// ── formatDefaultNoteTitle ─────────────────────────────────────────────────

describe("formatDefaultNoteTitle", () => {
  it("appends 'のノート' to the user name", () => {
    expect(formatDefaultNoteTitle("山田")).toBe("山田のノート");
  });

  it("works with English names", () => {
    expect(formatDefaultNoteTitle("Alice")).toBe("Aliceのノート");
  });

  it("preserves whitespace inside the name", () => {
    // 表示名にスペースが含まれていても切り落とさず、そのまま連結する。
    // Whitespace in the display name is preserved verbatim.
    expect(formatDefaultNoteTitle("Alice Bob")).toBe("Alice Bobのノート");
  });
});

// ── getDefaultNoteOrNull ───────────────────────────────────────────────────

describe("getDefaultNoteOrNull", () => {
  it("returns the row when a live default note exists", async () => {
    const note = buildNote();
    const db = createMockDb([[note]]);

    const result = await getDefaultNoteOrNull(db as never, "user-1");

    expect(result).toEqual(note);
  });

  it("returns null when the user has no default note yet", async () => {
    const db = createMockDb([[]]);

    const result = await getDefaultNoteOrNull(db as never, "user-1");

    expect(result).toBeNull();
  });
});

// ── ensureDefaultNote ──────────────────────────────────────────────────────

describe("ensureDefaultNote", () => {
  it("returns the existing default note without inserting (idempotent re-call)", async () => {
    // Given: 既に有効なデフォルトノート行がある。INSERT も users SELECT も走らない。
    // Existing default note → no INSERT, no users lookup.
    const note = buildNote();
    const db = createMockDb([
      [note], // getDefaultNoteOrNull → existing row
    ]);

    const result = await ensureDefaultNote(db as never, "user-1");

    expect(result).toEqual(note);
  });

  it("creates and returns a new default note titled '<users.name>のノート' on first call", async () => {
    // Given: デフォルトノート未作成。users.name を引いてタイトルを組み立て、
    // INSERT … RETURNING で新規行を返す。
    // First-time path: SELECT users.name → INSERT → RETURNING new row.
    const created = buildNote({ id: "note-new", title: "山田のノート" });
    const db = createMockDb([
      [], // getDefaultNoteOrNull → no row
      [{ name: "山田" }], // users select
      [created], // INSERT returning
    ]);

    const result = await ensureDefaultNote(db as never, "user-1");

    expect(result).toEqual(created);
    expect(result.title).toBe("山田のノート");
  });

  it("recovers the winner's row when a concurrent insert wins (ON CONFLICT swallowed)", async () => {
    // Given: 並行呼び出しに敗け、INSERT が 0 行返した場合は再 SELECT で勝者を読む。
    // Race-loser path: INSERT returns 0 rows → re-read the winner via
    // getDefaultNoteOrNull and return it instead of throwing.
    const winner = buildNote({ id: "note-winner", title: "山田のノート" });
    const db = createMockDb([
      [], // first getDefaultNoteOrNull → no row
      [{ name: "山田" }], // users select
      [], // INSERT returning (empty: conflict swallowed by ON CONFLICT DO NOTHING)
      [winner], // second getDefaultNoteOrNull → winner's row
    ]);

    const result = await ensureDefaultNote(db as never, "user-1");

    expect(result).toEqual(winner);
  });

  it("throws 404 when the user does not exist", async () => {
    // Given: users SELECT が空配列。404 を投げる。
    // Missing user → throw HTTPException 404 (matches the route-layer convention).
    const db = createMockDb([
      [], // getDefaultNoteOrNull → no row
      [], // users select → empty
    ]);

    await expect(ensureDefaultNote(db as never, "user-missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 500 when both INSERT and the winner-readback fail to surface a row", async () => {
    // Given: INSERT が 0 行で、かつ並行勝者の読み返しも空配列だった病的ケース。
    // 整合性が壊れている可能性があるため 500 で止める。
    // Pathological case: INSERT returns nothing AND the re-read also returns
    // nothing. We refuse to silently succeed and surface a 500 instead.
    const db = createMockDb([
      [], // getDefaultNoteOrNull → no row
      [{ name: "山田" }], // users select
      [], // INSERT returning empty
      [], // second getDefaultNoteOrNull → still empty
    ]);

    await expect(ensureDefaultNote(db as never, "user-1")).rejects.toMatchObject({
      status: 500,
    });
  });
});
