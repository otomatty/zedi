import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MAX_PINNED_NOTES,
  readPinnedNoteIds,
  togglePinnedNoteId,
  writePinnedNoteIds,
  NOTE_PINNED_STORAGE_KEY,
} from "./notePinnedStorage";

describe("notePinnedStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips pinned ids", () => {
    writePinnedNoteIds(["a", "b"]);
    expect(readPinnedNoteIds()).toEqual(["a", "b"]);
  });

  it("toggles pin on and off", () => {
    expect(togglePinnedNoteId("a", [])).toEqual(["a"]);
    expect(togglePinnedNoteId("a", ["a"])).toEqual([]);
  });

  it("drops oldest pin when at capacity", () => {
    const full = Array.from({ length: MAX_PINNED_NOTES }, (_, i) => `id-${i}`);
    const next = togglePinnedNoteId("new", full);
    expect(next).toHaveLength(MAX_PINNED_NOTES);
    expect(next[0]).toBe("id-1");
    expect(next[MAX_PINNED_NOTES - 1]).toBe("new");
  });

  it("returns empty array for invalid JSON", () => {
    localStorage.setItem(NOTE_PINNED_STORAGE_KEY, "not-json");
    expect(readPinnedNoteIds()).toEqual([]);
  });

  it("ignores write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => writePinnedNoteIds(["a"])).not.toThrow();
  });
});
