import { describe, it, expect } from "vitest";
import { MAX_TAGS, MAX_TAG_LENGTH, parseTagsParam, serializeTagsParam } from "./urlTagsCodec";
import { UNTAGGED_FILTER_TOKEN } from "@/types/tagFilter";

describe("parseTagsParam", () => {
  it("returns none-selected for null/undefined/empty", () => {
    expect(parseTagsParam(null)).toEqual({ kind: "none-selected" });
    expect(parseTagsParam(undefined)).toEqual({ kind: "none-selected" });
    expect(parseTagsParam("")).toEqual({ kind: "none-selected" });
  });

  it("returns none-selected when only separators are present", () => {
    expect(parseTagsParam(",,,")).toEqual({ kind: "none-selected" });
    expect(parseTagsParam(" , ,  ,")).toEqual({ kind: "none-selected" });
  });

  it("parses a single tag", () => {
    expect(parseTagsParam("typescript")).toEqual({
      kind: "tags",
      tags: ["typescript"],
    });
  });

  it("parses multiple tags as OR list", () => {
    expect(parseTagsParam("typescript,react,vite")).toEqual({
      kind: "tags",
      tags: ["typescript", "react", "vite"],
    });
  });

  it("lower-cases tag names", () => {
    expect(parseTagsParam("TypeScript,React")).toEqual({
      kind: "tags",
      tags: ["typescript", "react"],
    });
  });

  it("trims whitespace around each token", () => {
    expect(parseTagsParam("  foo , bar  ")).toEqual({
      kind: "tags",
      tags: ["foo", "bar"],
    });
  });

  it("de-duplicates case-insensitively while preserving first-seen order", () => {
    expect(parseTagsParam("foo,Foo,FOO,bar,foo")).toEqual({
      kind: "tags",
      tags: ["foo", "bar"],
    });
  });

  it("returns untagged-only for the __none__ token alone", () => {
    expect(parseTagsParam(UNTAGGED_FILTER_TOKEN)).toEqual({
      kind: "untagged-only",
    });
  });

  it("collapses any mix of __none__ + tags to untagged-only (token is exclusive)", () => {
    expect(parseTagsParam("foo,__none__,bar")).toEqual({
      kind: "untagged-only",
    });
    expect(parseTagsParam("__none__,foo")).toEqual({
      kind: "untagged-only",
    });
  });

  it("truncates at MAX_TAGS distinct tokens", () => {
    const many = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `tag${i}`).join(",");
    const parsed = parseTagsParam(many);
    expect(parsed.kind).toBe("tags");
    if (parsed.kind === "tags") {
      expect(parsed.tags).toHaveLength(MAX_TAGS);
      expect(parsed.tags[0]).toBe("tag0");
    }
  });

  it("drops tokens that exceed MAX_TAG_LENGTH", () => {
    const tooLong = "a".repeat(MAX_TAG_LENGTH + 1);
    expect(parseTagsParam(`${tooLong},ok`)).toEqual({
      kind: "tags",
      tags: ["ok"],
    });
  });

  it("supports non-ASCII tag names verbatim (after lowercasing)", () => {
    expect(parseTagsParam("日本語,テスト")).toEqual({
      kind: "tags",
      tags: ["日本語", "テスト"],
    });
  });
});

describe("serializeTagsParam", () => {
  it("returns null for none-selected so the caller can drop the param", () => {
    expect(serializeTagsParam({ kind: "none-selected" })).toBeNull();
  });

  it("serializes untagged-only as the __none__ token", () => {
    expect(serializeTagsParam({ kind: "untagged-only" })).toBe(UNTAGGED_FILTER_TOKEN);
  });

  it("serializes a tags list as comma-joined lower-case", () => {
    expect(serializeTagsParam({ kind: "tags", tags: ["typescript", "react"] })).toBe(
      "typescript,react",
    );
  });

  it("normalizes tags during serialize (lower-case, trim, dedupe)", () => {
    expect(
      serializeTagsParam({
        kind: "tags",
        tags: [" TypeScript ", "react", "REACT"],
      }),
    ).toBe("typescript,react");
  });

  it("returns null when tags list normalizes to empty", () => {
    expect(serializeTagsParam({ kind: "tags", tags: ["", "   "] })).toBeNull();
  });

  it("truncates to MAX_TAGS during serialize", () => {
    const many = Array.from({ length: MAX_TAGS + 3 }, (_, i) => `tag${i}`);
    const out = serializeTagsParam({ kind: "tags", tags: many });
    expect(out).not.toBeNull();
    expect((out ?? "").split(",")).toHaveLength(MAX_TAGS);
  });
});

describe("roundtrip", () => {
  it("normalizes mixed-case input then survives serialize → parse identically", () => {
    const parsed = parseTagsParam("TypeScript,React,react,VITE");
    const serialized = serializeTagsParam(parsed);
    expect(serialized).toBe("typescript,react,vite");
    const reparsed = parseTagsParam(serialized);
    expect(reparsed).toEqual(parsed);
  });

  it("roundtrips untagged-only", () => {
    const parsed = parseTagsParam(UNTAGGED_FILTER_TOKEN);
    const serialized = serializeTagsParam(parsed);
    expect(serialized).toBe(UNTAGGED_FILTER_TOKEN);
    expect(parseTagsParam(serialized)).toEqual(parsed);
  });

  it("roundtrips none-selected via null", () => {
    const parsed = parseTagsParam(null);
    expect(serializeTagsParam(parsed)).toBeNull();
  });
});
