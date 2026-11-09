/** Note filter preferences. / ノートごとのフィルターバー設定を検証する。 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTagFilterBarPreference } from "@/hooks/tags/useTagFilterBarPreference";

let mockNote: { showTagFilterBar?: boolean } | undefined;

vi.mock("@/hooks/notes/useNoteQueries", () => ({
  useNote: () => ({ note: mockNote }),
}));

const storageKey = "zedi-note-filter-preferences";

describe("useTagFilterBarPreference", () => {
  beforeEach(() => {
    mockNote = { showTagFilterBar: false };
    localStorage.removeItem(storageKey);
  });

  it.each([
    { note: undefined, override: undefined, noteDefault: false, enabled: false },
    { note: {}, override: undefined, noteDefault: false, enabled: false },
    {
      note: { showTagFilterBar: true },
      override: undefined,
      noteDefault: true,
      enabled: true,
    },
    { note: { showTagFilterBar: false }, override: true, noteDefault: false, enabled: true },
    { note: { showTagFilterBar: true }, override: false, noteDefault: true, enabled: false },
  ])("resolves the note default and stored override: $note / $override", (testCase) => {
    mockNote = testCase.note;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ "note-a": { showTagFilterBar: testCase.override } }),
    );

    const { result } = renderHook(() => useTagFilterBarPreference("note-a"));

    expect(result.current.noteDefault).toBe(testCase.noteDefault);
    expect(result.current.userOverride).toBe(testCase.override);
    expect(result.current.enabled).toBe(testCase.enabled);
  });

  it("reads the new note's saved override on noteId changes and when returning", () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        "note-a": { showTagFilterBar: true },
        "note-b": { showTagFilterBar: false },
      }),
    );
    const renders: { noteId: string; override: boolean | undefined }[] = [];
    const { result, rerender } = renderHook(
      ({ noteId }) => {
        const value = useTagFilterBarPreference(noteId);
        renders.push({ noteId, override: value.userOverride });
        return value;
      },
      {
        initialProps: { noteId: "note-a" },
      },
    );

    expect(result.current.userOverride).toBe(true);
    rerender({ noteId: "note-b" });
    expect(result.current.userOverride).toBe(false);
    expect(result.current.enabled).toBe(false);
    expect(renders.find((value) => value.noteId === "note-b")).toEqual({
      noteId: "note-b",
      override: false,
    });
    rerender({ noteId: "note-c" });
    expect(result.current.userOverride).toBeUndefined();
    rerender({ noteId: "note-a" });
    expect(result.current.userOverride).toBe(true);
    expect(result.current.enabled).toBe(true);
  });

  it("keeps its state when the same noteId rerenders despite a storage change", () => {
    const { result, rerender } = renderHook(() => useTagFilterBarPreference("note-a"));

    act(() => {
      result.current.setOverride(true);
    });
    localStorage.setItem(storageKey, JSON.stringify({ "note-a": { showTagFilterBar: false } }));
    rerender();

    expect(result.current.userOverride).toBe(true);
    expect(result.current.enabled).toBe(true);
  });

  it.each([true, false])("saves the %s override for the currently selected note", (override) => {
    localStorage.setItem(storageKey, JSON.stringify({ "note-a": { showTagFilterBar: true } }));
    const { result, rerender } = renderHook(({ noteId }) => useTagFilterBarPreference(noteId), {
      initialProps: { noteId: "note-a" },
    });
    rerender({ noteId: "note-b" });

    act(() => {
      result.current.setOverride(override);
    });

    expect(result.current.userOverride).toBe(override);
    expect(result.current.enabled).toBe(override);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toEqual({
      "note-a": { showTagFilterBar: true },
      "note-b": { showTagFilterBar: override },
    });
  });

  it("removes only the selected note's override and returns to its default", () => {
    mockNote = { showTagFilterBar: true };
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        "note-a": { showTagFilterBar: false },
        "note-b": { showTagFilterBar: true },
      }),
    );
    const { result } = renderHook(() => useTagFilterBarPreference("note-a"));
    expect(result.current.enabled).toBe(false);

    act(() => {
      result.current.setOverride(undefined);
    });

    expect(result.current.userOverride).toBeUndefined();
    expect(result.current.noteDefault).toBe(true);
    expect(result.current.enabled).toBe(true);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toEqual({
      "note-b": { showTagFilterBar: true },
    });
  });

  it("follows note-default changes only when no override is set", () => {
    const { result, rerender } = renderHook(() => useTagFilterBarPreference("note-a"));
    expect(result.current.enabled).toBe(false);

    mockNote = { showTagFilterBar: true };
    rerender();
    expect(result.current.noteDefault).toBe(true);
    expect(result.current.enabled).toBe(true);

    act(() => {
      result.current.setOverride(false);
    });
    rerender();
    expect(result.current.noteDefault).toBe(true);
    expect(result.current.enabled).toBe(false);
  });
});
