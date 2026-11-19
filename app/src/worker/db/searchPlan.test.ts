import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "./searchPlan";

describe("buildSearchPlan", () => {
  it("returns null for a blank query", () => {
    expect(buildSearchPlan("   ")).toBeNull();
  });

  it("uses an FTS5 trigram MATCH when every term has at least 3 characters", () => {
    expect(buildSearchPlan("知識ネットワーク Hono")).toEqual({
      match: '"知識ネットワーク" "Hono"',
      likes: [],
    });
  });

  it("quotes terms so FTS5 operators and double quotes are matched literally", () => {
    expect(buildSearchPlan('a"b"c OR*')).toEqual({ match: '"a""b""c" "OR*"', likes: [] });
  });

  it("falls back to LIKE for terms shorter than 3 characters (trigram cannot match them)", () => {
    expect(buildSearchPlan("AI")).toEqual({ match: null, likes: ["%AI%"] });
    expect(buildSearchPlan("設計 Durable")).toEqual({ match: '"Durable"', likes: ["%設計%"] });
  });

  it("escapes LIKE wildcards and the escape character", () => {
    expect(buildSearchPlan("%_")).toEqual({ match: null, likes: ["%\\%\\_%"] });
    expect(buildSearchPlan("a\\")).toEqual({ match: null, likes: ["%a\\\\%"] });
  });

  it("counts characters, not UTF-16 units or bytes (emoji and CJK)", () => {
    expect(buildSearchPlan("😀😀")?.likes).toEqual(["%😀😀%"]);
    expect(buildSearchPlan("知識網")?.match).toBe('"知識網"');
  });

  it("ignores duplicate terms and caps the number of terms", () => {
    expect(buildSearchPlan("Hono Hono")).toEqual({ match: '"Hono"', likes: [] });
    const many = Array.from({ length: 12 }, (_, i) => `term${i}`).join(" ");
    expect(buildSearchPlan(many)?.match?.split(" ")).toHaveLength(8);
  });
});
