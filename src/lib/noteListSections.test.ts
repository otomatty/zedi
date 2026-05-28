import { describe, it, expect } from "vitest";
import type { NoteSummary } from "@/types/note";
import {
  buildNoteListSections,
  resolveNoteDisplayTitle,
  buildSwitcherNotes,
  filterNotesByTitle,
  sortNotes,
} from "./noteListSections";

function makeNote(overrides: Partial<NoteSummary> & { id: string }): NoteSummary {
  return {
    id: overrides.id,
    ownerUserId: "u1",
    title: overrides.title ?? "Title",
    visibility: "private",
    editPermission: "owner_only",
    isOfficial: false,
    isDefault: false,
    viewCount: 0,
    showTagFilterBar: false,
    defaultFilterTags: [],
    createdAt: 0,
    updatedAt: overrides.updatedAt ?? 0,
    isDeleted: overrides.isDeleted ?? false,
    role: "owner",
    pageCount: 0,
    memberCount: 0,
  };
}

describe("buildNoteListSections", () => {
  const notes = [
    makeNote({ id: "default", title: "Default", updatedAt: 100 }),
    makeNote({ id: "a", title: "A", updatedAt: 500 }),
    makeNote({ id: "b", title: "B", updatedAt: 400 }),
    makeNote({ id: "c", title: "C", updatedAt: 300 }),
    makeNote({ id: "dead", title: "Dead", updatedAt: 900, isDeleted: true }),
  ];

  it("puts default note first in pinned and excludes deleted notes", () => {
    const sections = buildNoteListSections(notes, ["c"], "default");
    expect(sections.pinned.map((n) => n.id)).toEqual(["default", "c"]);
    expect(sections.recent.map((n) => n.id)).toEqual(["a", "b"]);
    expect(sections.all).toHaveLength(0);
    expect(sections.pinned.some((n) => n.id === "dead")).toBe(false);
  });

  it("limits recent section to three by default", () => {
    const many = [
      makeNote({ id: "d", updatedAt: 10 }),
      makeNote({ id: "e", updatedAt: 20 }),
      makeNote({ id: "f", updatedAt: 30 }),
      makeNote({ id: "g", updatedAt: 40 }),
      makeNote({ id: "h", updatedAt: 50 }),
    ];
    const sections = buildNoteListSections(many, [], null);
    expect(sections.recent).toHaveLength(3);
    expect(sections.recent[0]?.id).toBe("h");
    expect(sections.all.map((n) => n.id)).toEqual(["e", "d"]);
  });
});

describe("buildSwitcherNotes", () => {
  it("returns pinned plus recent only", () => {
    const notes = [
      makeNote({ id: "default", updatedAt: 1 }),
      makeNote({ id: "a", updatedAt: 100 }),
      makeNote({ id: "b", updatedAt: 90 }),
      makeNote({ id: "c", updatedAt: 80 }),
      makeNote({ id: "d", updatedAt: 70 }),
      makeNote({ id: "e", updatedAt: 60 }),
      makeNote({ id: "f", updatedAt: 50 }),
    ];
    const rows = buildSwitcherNotes(notes, [], "default", { recentCount: 5 });
    expect(rows.map((n) => n.id)).toEqual(["default", "a", "b", "c", "d", "e"]);
    expect(rows).toHaveLength(6);
  });
});

describe("resolveNoteDisplayTitle", () => {
  it("returns untitled label for null or blank titles", () => {
    expect(resolveNoteDisplayTitle(null, "Untitled")).toBe("Untitled");
    expect(resolveNoteDisplayTitle("  ", "Untitled")).toBe("Untitled");
  });
});

describe("filterNotesByTitle", () => {
  it("filters case-insensitively", () => {
    const notes = [makeNote({ id: "1", title: "Team Alpha" })];
    expect(filterNotesByTitle(notes, "alpha")).toHaveLength(1);
    expect(filterNotesByTitle(notes, "  ")).toHaveLength(1);
  });
});

describe("sortNotes", () => {
  it("sorts by title", () => {
    const notes = [makeNote({ id: "1", title: "Zed" }), makeNote({ id: "2", title: "Alpha" })];
    expect(sortNotes(notes, "title").map((n) => n.id)).toEqual(["2", "1"]);
  });
});
