/**
 * `services/pageAccessService.ts` のテスト。
 *
 * Issue #713 で導入した「個人ページ vs ノートネイティブページ」の権限分岐を
 * 中心に検証する。
 *
 * Tests for `services/pageAccessService.ts`. Focused on the personal-page vs.
 * note-native-page authorization split introduced in issue #713.
 */
import { describe, it, expect } from "vitest";
import type { Database } from "../../types/index.js";
import { createMockDb } from "../createMockDb.js";
import { assertPageViewAccess, assertPageEditAccess } from "../../services/pageAccessService.js";

const USER_ID = "user-123";
const OTHER_USER_ID = "user-other";
const USER_EMAIL = "user@example.com";
const PAGE_ID = "page-001";
const NOTE_ID = "note-001";

function asDb(db: unknown): Database {
  return db as unknown as Database;
}

describe("assertPageViewAccess (issue #713)", () => {
  it("allows personal page owner", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: USER_ID, noteId: null }], // getPageOwnership
    ]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("denies non-owner / non-member on personal page", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: null }], // getPageOwnership
      [{ email: USER_EMAIL }], // getUserEmailLowercase
      [], // notePages JOIN — no membership
      [], // note_pages -> notes.owner_id fallback
    ]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows note owner on a linked personal page even without a note_members row", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: null }], // getPageOwnership
      [{ email: USER_EMAIL }], // getUserEmailLowercase
      [], // notePages JOIN — no membership
      [{ noteId: NOTE_ID }], // note_pages -> notes.owner_id fallback
    ]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("denies note-native page when caller has no role on the note", async () => {
    // ノートネイティブページは pages.ownerId 一致では許可しない（脱退者対策）。
    // Note-native: owning the underlying pages row is intentionally not enough.
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: USER_ID, noteId: NOTE_ID }], // getPageOwnership
      [{ email: USER_EMAIL }], // getUserEmailLowercase
      [], // getNoteRole → findActiveNoteById: note not found by helper path
    ]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows note owner on note-native page", async () => {
    const noteRow = {
      id: NOTE_ID,
      ownerId: USER_ID,
      title: "n",
      visibility: "private",
      editPermission: "owner_only",
      isOfficial: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: NOTE_ID }], // getPageOwnership
      [{ email: USER_EMAIL }], // getUserEmailLowercase
      [noteRow], // getNoteRole → findActiveNoteById (owner short-circuits, no further queries)
    ]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("returns 404 when page is missing", async () => {
    const { db } = createMockDb([[]]); // getPageOwnership empty
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("assertPageEditAccess (issue #713)", () => {
  it("allows personal page owner", async () => {
    const { db } = createMockDb([[{ id: PAGE_ID, ownerId: USER_ID, noteId: null }]]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("denies non-owner on personal page (note membership doesn't grant edit)", async () => {
    const { db } = createMockDb([[{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: null }]]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows note owner on note-native page (canEdit=true)", async () => {
    const noteRow = {
      id: NOTE_ID,
      ownerId: USER_ID,
      title: "n",
      visibility: "private",
      editPermission: "owner_only",
      isOfficial: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [noteRow], // getNoteRole owner short-circuit
    ]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("denies viewer member on note-native page when editPermission=members_editors", async () => {
    const noteRow = {
      id: NOTE_ID,
      ownerId: OTHER_USER_ID,
      title: "n",
      visibility: "private",
      editPermission: "members_editors",
      isOfficial: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: USER_ID, noteId: NOTE_ID }], // getPageOwnership (own underlying row)
      [{ email: USER_EMAIL }],
      [noteRow], // findActiveNoteById
      [{ role: "viewer" }], // member lookup → viewer
    ]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows editor member on note-native page when editPermission=members_editors", async () => {
    const noteRow = {
      id: NOTE_ID,
      ownerId: OTHER_USER_ID,
      title: "n",
      visibility: "private",
      editPermission: "members_editors",
      isOfficial: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [noteRow],
      [{ role: "editor" }], // editor passes canEdit when editPermission != owner_only
    ]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("denies non-owner of underlying row when no note role resolves", async () => {
    // ノートネイティブページの編集権限は note ロールのみで判定。
    // Note-native edit permission depends on note role only — owning the
    // underlying pages row (e.g. created the page then was removed) is NOT
    // enough. See issue #713.
    const noteRow = {
      id: NOTE_ID,
      ownerId: OTHER_USER_ID,
      title: "n",
      visibility: "private",
      editPermission: "owner_only",
      isOfficial: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [noteRow],
      [], // member lookup empty
      [], // domain access lookup empty
    ]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });
});
