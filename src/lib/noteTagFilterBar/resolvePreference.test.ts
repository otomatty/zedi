import { describe, it, expect } from "vitest";
import { resolveShowFilterBar, resolveInitialSelectedTags } from "./resolvePreference";

describe("resolveShowFilterBar", () => {
  it("returns the note default when there is no user override", () => {
    expect(resolveShowFilterBar(true, undefined)).toBe(true);
    expect(resolveShowFilterBar(false, undefined)).toBe(false);
  });

  it("uses the user override when present (true overrides false)", () => {
    expect(resolveShowFilterBar(false, true)).toBe(true);
  });

  it("uses the user override when present (false overrides true)", () => {
    expect(resolveShowFilterBar(true, false)).toBe(false);
  });

  it("matches the override exactly even when it equals the default", () => {
    expect(resolveShowFilterBar(true, true)).toBe(true);
    expect(resolveShowFilterBar(false, false)).toBe(false);
  });
});

describe("resolveInitialSelectedTags", () => {
  it("prefers URL over note default when URL has tags", () => {
    expect(resolveInitialSelectedTags("foo,bar", ["baz"])).toEqual({
      kind: "tags",
      tags: ["foo", "bar"],
    });
  });

  it("prefers URL even when URL is __none__", () => {
    expect(resolveInitialSelectedTags("__none__", ["baz"])).toEqual({
      kind: "untagged-only",
    });
  });

  it("falls back to note default when URL is null", () => {
    expect(resolveInitialSelectedTags(null, ["TypeScript", "React"])).toEqual({
      kind: "tags",
      tags: ["typescript", "react"],
    });
  });

  it("falls back to note default when URL is an empty string", () => {
    expect(resolveInitialSelectedTags("", ["foo"])).toEqual({
      kind: "tags",
      tags: ["foo"],
    });
  });

  it("supports __none__ as a note default", () => {
    expect(resolveInitialSelectedTags(null, ["__none__"])).toEqual({
      kind: "untagged-only",
    });
  });

  it("returns none-selected when both URL and note default are empty", () => {
    expect(resolveInitialSelectedTags(null, null)).toEqual({ kind: "none-selected" });
    expect(resolveInitialSelectedTags(null, [])).toEqual({ kind: "none-selected" });
    expect(resolveInitialSelectedTags("", [])).toEqual({ kind: "none-selected" });
  });
});
