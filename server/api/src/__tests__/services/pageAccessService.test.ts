/**
 * `services/pageAccessService.ts` のテスト。
 *
 * Issue #823 以降はすべてのページが `pages.note_id` でノートに所属し、閲覧・編集は
 * `getNoteRole` / `canEdit` のみで判定する（`pages.owner_id` の一致だけでは許可しない）。
 *
 * Tests for `services/pageAccessService.ts`. After issue #823 every page belongs to a
 * note via `pages.note_id`; view/edit authorization uses `getNoteRole` / `canEdit`
 * only — owning the `pages` row alone is never sufficient.
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

function noteRow(
  ownerId: string,
  overrides: Partial<{ editPermission: "owner_only" | "members_editors" }> = {},
) {
  return {
    id: NOTE_ID,
    ownerId,
    title: "n",
    visibility: "private" as const,
    editPermission: overrides.editPermission ?? "owner_only",
    isOfficial: false,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  };
}

/** Private note, caller not owner: member + domain rule lookups run then deny. */
function noRoleChains(pageOwnerId: string) {
  return [
    [{ id: PAGE_ID, ownerId: pageOwnerId, noteId: NOTE_ID }],
    [{ email: USER_EMAIL }],
    [noteRow(OTHER_USER_ID)],
    [],
    [],
  ];
}

describe("assertPageViewAccess (issue #823)", () => {
  it("allows note owner even when pages.owner_id differs", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [noteRow(USER_ID)],
    ]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("denies when caller has no resolved note role (pages.owner_id match is insufficient)", async () => {
    const { db } = createMockDb(noRoleChains(USER_ID));
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("denies when active note row is missing", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [],
    ]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("denies note-native page when caller has no role on the note", async () => {
    const { db } = createMockDb(noRoleChains(USER_ID));
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows note owner on note-native page", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [noteRow(USER_ID)],
    ]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("returns 404 when page is missing", async () => {
    const { db } = createMockDb([[]]);
    await expect(assertPageViewAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("assertPageEditAccess (issue #823)", () => {
  it("allows note owner on note-native page (canEdit=true)", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [noteRow(USER_ID)],
    ]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("denies when pages.owner_id matches but caller has no note edit role", async () => {
    const { db } = createMockDb(noRoleChains(USER_ID));
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("denies viewer member on note-native page when editPermission=members_editors", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [noteRow(OTHER_USER_ID, { editPermission: "members_editors" })],
      [{ role: "viewer" }],
    ]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows editor member on note-native page when editPermission=members_editors", async () => {
    const { db } = createMockDb([
      [{ id: PAGE_ID, ownerId: OTHER_USER_ID, noteId: NOTE_ID }],
      [{ email: USER_EMAIL }],
      [noteRow(OTHER_USER_ID, { editPermission: "members_editors" })],
      [{ role: "editor" }],
    ]);
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it("denies non-owner of underlying row when no note role resolves", async () => {
    const { db } = createMockDb(noRoleChains(USER_ID));
    await expect(assertPageEditAccess(asDb(db), PAGE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });
});
