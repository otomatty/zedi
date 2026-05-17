import { describe, it, expect, beforeEach } from "vitest";
import {
  NOTE_FILTER_PREFERENCES_STORAGE_KEY,
  getShowTagFilterBarOverride,
  loadNoteFilterPreferences,
  saveNoteFilterPreferences,
  setShowTagFilterBarOverride,
} from "./preferenceStorage";

describe("preferenceStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadNoteFilterPreferences", () => {
    it("returns empty when storage is empty", () => {
      expect(loadNoteFilterPreferences()).toEqual({});
    });

    it("returns empty when JSON is invalid", () => {
      localStorage.setItem(NOTE_FILTER_PREFERENCES_STORAGE_KEY, "{ not json");
      expect(loadNoteFilterPreferences()).toEqual({});
    });

    it("returns empty when stored value is not an object", () => {
      localStorage.setItem(NOTE_FILTER_PREFERENCES_STORAGE_KEY, JSON.stringify([1, 2]));
      expect(loadNoteFilterPreferences()).toEqual({});
    });

    it("loads valid entries and drops malformed ones", () => {
      localStorage.setItem(
        NOTE_FILTER_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          "note-a": { showTagFilterBar: true },
          "note-b": { showTagFilterBar: false },
          "note-c": { showTagFilterBar: "not-a-bool" },
          "note-d": null,
          "": { showTagFilterBar: true },
        }),
      );
      expect(loadNoteFilterPreferences()).toEqual({
        "note-a": { showTagFilterBar: true },
        "note-b": { showTagFilterBar: false },
      });
    });
  });

  describe("saveNoteFilterPreferences", () => {
    it("writes valid entries to storage", () => {
      saveNoteFilterPreferences({
        "note-a": { showTagFilterBar: true },
      });
      const raw = localStorage.getItem(NOTE_FILTER_PREFERENCES_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(raw && JSON.parse(raw)).toEqual({ "note-a": { showTagFilterBar: true } });
    });

    it("drops entries that compact to empty objects", () => {
      saveNoteFilterPreferences({
        "note-a": { showTagFilterBar: true },
        "note-b": {},
      });
      const raw = localStorage.getItem(NOTE_FILTER_PREFERENCES_STORAGE_KEY);
      expect(raw && JSON.parse(raw)).toEqual({ "note-a": { showTagFilterBar: true } });
    });

    it("roundtrips via load", () => {
      const written = {
        "note-x": { showTagFilterBar: false },
        "note-y": { showTagFilterBar: true },
      };
      saveNoteFilterPreferences(written);
      expect(loadNoteFilterPreferences()).toEqual(written);
    });
  });

  describe("setShowTagFilterBarOverride", () => {
    it("sets a new override and persists it", () => {
      const after = setShowTagFilterBarOverride("note-1", true);
      expect(after["note-1"]).toEqual({ showTagFilterBar: true });
      expect(loadNoteFilterPreferences()).toEqual({
        "note-1": { showTagFilterBar: true },
      });
    });

    it("updates an existing override", () => {
      setShowTagFilterBarOverride("note-1", true);
      setShowTagFilterBarOverride("note-1", false);
      expect(getShowTagFilterBarOverride("note-1")).toBe(false);
    });

    it("removes the override entirely when value is undefined", () => {
      setShowTagFilterBarOverride("note-1", true);
      const after = setShowTagFilterBarOverride("note-1", undefined);
      expect(after["note-1"]).toBeUndefined();
      expect(loadNoteFilterPreferences()).toEqual({});
    });

    it("does not affect other notes when clearing one", () => {
      setShowTagFilterBarOverride("note-1", true);
      setShowTagFilterBarOverride("note-2", false);
      setShowTagFilterBarOverride("note-1", undefined);
      expect(loadNoteFilterPreferences()).toEqual({
        "note-2": { showTagFilterBar: false },
      });
    });

    it("ignores empty noteId", () => {
      const before = loadNoteFilterPreferences();
      const after = setShowTagFilterBarOverride("", true);
      expect(after).toEqual(before);
    });
  });

  describe("getShowTagFilterBarOverride", () => {
    it("returns undefined when no override is set", () => {
      expect(getShowTagFilterBarOverride("note-x")).toBeUndefined();
    });

    it("returns the stored boolean value", () => {
      setShowTagFilterBarOverride("note-x", false);
      expect(getShowTagFilterBarOverride("note-x")).toBe(false);
    });

    it("returns undefined for empty noteId", () => {
      setShowTagFilterBarOverride("note-x", true);
      expect(getShowTagFilterBarOverride("")).toBeUndefined();
    });
  });
});
