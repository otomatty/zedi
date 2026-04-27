import { describe, it, expect } from "vitest";
import { buildSeedTutorialPages } from "./seedTutorialPages";

/**
 * シードページ生成がロケールキーを解決し、3 件・JSON 可能な Tiptap doc になること。
 * Seed pages resolve locale keys and form three valid Tiptap JSON docs.
 */
function jaT(key: string): string {
  const table: Record<string, string> = {
    "seedData.welcome.title": "T_W",
    "seedData.welcome.p1": "P1",
    "seedData.welcome.p2": "P2",
    "seedData.welcome.hBasics": "H",
    "seedData.welcome.li1": "L1",
    "seedData.welcome.li2": "L2",
    "seedData.welcome.li3": "L3",
    "seedData.links.title": "T_L",
    "seedData.links.p1": "LP1",
    "seedData.links.hTypes": "LH",
    "seedData.links.liInternal": "LI1",
    "seedData.links.liGhost": "LI2",
    "seedData.links.p2": "LP2",
    "seedData.capture.title": "T_C",
    "seedData.capture.p1": "CP1",
    "seedData.capture.hTips": "CH",
    "seedData.capture.o1": "O1",
    "seedData.capture.o2": "O2",
    "seedData.capture.o3": "O3",
    "seedData.capture.quote": "Q",
  };
  return table[key] ?? key;
}

describe("buildSeedTutorialPages", () => {
  it("returns three pages with parseable Tiptap JSON", () => {
    const pages = buildSeedTutorialPages(jaT);
    expect(pages).toHaveLength(3);
    for (const p of pages) {
      const doc = JSON.parse(p.content) as { type: string; content: unknown[] };
      expect(doc.type).toBe("doc");
      expect(Array.isArray(doc.content)).toBe(true);
    }
  });

  it("uses first heading text from t", () => {
    const [first] = buildSeedTutorialPages(jaT);
    const doc = JSON.parse(first.content) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };
    const heading = doc.content.find((n) => n.type === "heading");
    const text = (heading?.content as Array<{ text: string }>)[0]?.text;
    expect(text).toBe("H");
  });
});
