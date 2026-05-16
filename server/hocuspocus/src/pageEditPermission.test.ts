import { describe, expect, it } from "vitest";
import {
  resolveNoteRole,
  canEditFromRole,
  type NoteAccessFacts,
  type DomainFacts,
} from "./pageEditPermission.js";

const OWNER_ID = "user-owner";
const SELF_ID = "user-self";

const baseNote: NoteAccessFacts = {
  ownerId: OWNER_ID,
  visibility: "private",
  editPermission: "owner_only",
};

const noDomain: DomainFacts = { rules: [] };

describe("resolveNoteRole", () => {
  it("returns 'owner' when the caller owns the note", () => {
    const role = resolveNoteRole(
      { ...baseNote, ownerId: SELF_ID },
      { userId: SELF_ID, emailLower: "self@example.com" },
      null,
      noDomain,
    );
    expect(role).toBe("owner");
  });

  it("returns the member role when an accepted membership row exists", () => {
    const role = resolveNoteRole(
      baseNote,
      { userId: SELF_ID, emailLower: "self@example.com" },
      { role: "editor" },
      noDomain,
    );
    expect(role).toBe("editor");
  });

  it("prefers an explicit member role over a stronger domain rule", () => {
    // ドメインルールで editor 相当だが本人は viewer メンバーとして招待されている
    // → 明示的なメンバーシップが勝つ（API の getNoteRole と整合）。
    const role = resolveNoteRole(
      baseNote,
      { userId: SELF_ID, emailLower: "self@example.com" },
      { role: "viewer" },
      { rules: [{ role: "editor" }] },
    );
    expect(role).toBe("viewer");
  });

  it("returns 'editor' when any matching domain rule is editor (editor wins over viewer)", () => {
    const role = resolveNoteRole(
      baseNote,
      { userId: SELF_ID, emailLower: "self@example.com" },
      null,
      { rules: [{ role: "viewer" }, { role: "editor" }] },
    );
    expect(role).toBe("editor");
  });

  it("returns 'viewer' when only viewer-level domain rules match", () => {
    const role = resolveNoteRole(
      baseNote,
      { userId: SELF_ID, emailLower: "self@example.com" },
      null,
      { rules: [{ role: "viewer" }] },
    );
    expect(role).toBe("viewer");
  });

  it("returns 'guest' on public/unlisted notes when no role is otherwise resolved", () => {
    expect(
      resolveNoteRole(
        { ...baseNote, visibility: "public" },
        { userId: SELF_ID, emailLower: "self@example.com" },
        null,
        noDomain,
      ),
    ).toBe("guest");
    expect(
      resolveNoteRole(
        { ...baseNote, visibility: "unlisted" },
        { userId: SELF_ID, emailLower: "self@example.com" },
        null,
        noDomain,
      ),
    ).toBe("guest");
  });

  it("returns null when a private/restricted note has no matching role", () => {
    expect(
      resolveNoteRole(
        { ...baseNote, visibility: "private" },
        { userId: SELF_ID, emailLower: "self@example.com" },
        null,
        noDomain,
      ),
    ).toBeNull();
    expect(
      resolveNoteRole(
        { ...baseNote, visibility: "restricted" },
        { userId: SELF_ID, emailLower: "self@example.com" },
        null,
        noDomain,
      ),
    ).toBeNull();
  });
});

describe("canEditFromRole", () => {
  it("owner can always edit regardless of edit_permission / visibility", () => {
    for (const ep of ["owner_only", "members_editors", "any_logged_in"] as const) {
      for (const vis of ["private", "public", "unlisted", "restricted"] as const) {
        expect(canEditFromRole("owner", { ...baseNote, editPermission: ep, visibility: vis })).toBe(
          true,
        );
      }
    }
  });

  it("editor can edit when edit_permission is not owner_only", () => {
    expect(canEditFromRole("editor", { ...baseNote, editPermission: "members_editors" })).toBe(
      true,
    );
    expect(canEditFromRole("editor", { ...baseNote, editPermission: "any_logged_in" })).toBe(true);
  });

  it("editor cannot edit when edit_permission is owner_only", () => {
    expect(canEditFromRole("editor", { ...baseNote, editPermission: "owner_only" })).toBe(false);
  });

  it("viewer cannot edit", () => {
    for (const ep of ["owner_only", "members_editors", "any_logged_in"] as const) {
      expect(canEditFromRole("viewer", { ...baseNote, editPermission: ep })).toBe(false);
    }
  });

  it("guest can edit only on public/unlisted notes with any_logged_in", () => {
    expect(
      canEditFromRole("guest", {
        ...baseNote,
        editPermission: "any_logged_in",
        visibility: "public",
      }),
    ).toBe(true);
    expect(
      canEditFromRole("guest", {
        ...baseNote,
        editPermission: "any_logged_in",
        visibility: "unlisted",
      }),
    ).toBe(true);
  });

  it("guest cannot edit when edit_permission is not any_logged_in", () => {
    expect(
      canEditFromRole("guest", {
        ...baseNote,
        editPermission: "members_editors",
        visibility: "public",
      }),
    ).toBe(false);
    expect(
      canEditFromRole("guest", {
        ...baseNote,
        editPermission: "owner_only",
        visibility: "unlisted",
      }),
    ).toBe(false);
  });

  it("null role cannot edit", () => {
    expect(canEditFromRole(null, baseNote)).toBe(false);
  });
});
