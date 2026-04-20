/**
 * Tests for entity extraction prompt and parser (P3, otomatty/zedi#597).
 * エンティティ抽出プロンプト・パーサーのユニットテスト。
 */
import { describe, it, expect } from "vitest";
import { buildExtractEntitiesPrompt, parseExtractedEntities } from "./extractEntitiesPrompt";

describe("buildExtractEntitiesPrompt", () => {
  it("includes conversation text in <conversation> tags", () => {
    const prompt = buildExtractEntitiesPrompt("User: hello\nAssistant: hi", []);
    expect(prompt).toContain("<conversation>");
    expect(prompt).toContain("User: hello");
    expect(prompt).toContain("</conversation>");
  });

  it("lists existing titles when provided", () => {
    const prompt = buildExtractEntitiesPrompt("test", ["React", "TypeScript"]);
    expect(prompt).toContain("- React");
    expect(prompt).toContain("- TypeScript");
  });

  it("shows (none) when no existing titles", () => {
    const prompt = buildExtractEntitiesPrompt("test", []);
    expect(prompt).toContain("(none)");
  });
});

describe("parseExtractedEntities", () => {
  it("parses a valid JSON array", () => {
    const raw = JSON.stringify([
      { title: "React", summary: "UI library", isNew: true },
      { title: "TypeScript", summary: "Typed JS", isNew: false },
    ]);
    const result = parseExtractedEntities(raw);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("React");
    expect(result[0].isNew).toBe(true);
    expect(result[1].title).toBe("TypeScript");
    expect(result[1].isNew).toBe(false);
  });

  it("strips markdown code fences", () => {
    const raw = '```json\n[{"title":"Rust","summary":"Systems language","isNew":true}]\n```';
    const result = parseExtractedEntities(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Rust");
  });

  it("handles extra text before/after the JSON array", () => {
    const raw = 'Here are the entities:\n[{"title":"Go","summary":"Language","isNew":true}]\nDone.';
    const result = parseExtractedEntities(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Go");
  });

  it("defaults isNew to true when not provided", () => {
    const raw = '[{"title":"Test","summary":"desc"}]';
    const result = parseExtractedEntities(raw);
    expect(result[0].isNew).toBe(true);
  });

  it("limits to 5 entities", () => {
    const arr = Array.from({ length: 8 }, (_, i) => ({
      title: `Entity ${i}`,
      summary: `Desc ${i}`,
      isNew: true,
    }));
    const result = parseExtractedEntities(JSON.stringify(arr));
    expect(result).toHaveLength(5);
  });

  it("throws on invalid input (no array)", () => {
    expect(() => parseExtractedEntities("not json")).toThrow("No JSON array found");
  });

  it("filters out malformed entries", () => {
    const raw = '[{"title":"Good","summary":"ok"},{"bad":true},{"title":123,"summary":"no"}]';
    const result = parseExtractedEntities(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Good");
  });

  it("trims whitespace from title and summary", () => {
    const raw = '[{"title":"  React  ","summary":"  UI lib  ","isNew":true}]';
    const result = parseExtractedEntities(raw);
    expect(result[0].title).toBe("React");
    expect(result[0].summary).toBe("UI lib");
  });
});
