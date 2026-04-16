/**
 * conflict ルールの単体テスト（純粋関数 extractFacts のテスト）。
 * Unit tests for the conflict rule (pure function extractFacts).
 */
import { describe, it, expect } from "vitest";
import { extractFacts } from "./conflict.js";

describe("extractFacts", () => {
  it("空文字列からは何も抽出しない / extracts nothing from empty string", () => {
    expect(extractFacts("")).toEqual([]);
  });

  it("日付パターンを抽出する / extracts date patterns", () => {
    const text = "東京タワーは 1958年12月23日 に完工した。";
    const facts = extractFacts(text);
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.value.includes("1958"))).toBe(true);
  });

  it("スラッシュ区切りの日付を抽出する / extracts slash-separated dates", () => {
    const text = "設立日は 2020/04/01 です。";
    const facts = extractFacts(text);
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.value.includes("2020"))).toBe(true);
  });

  it("ハイフン区切りの日付を抽出する / extracts hyphen-separated dates", () => {
    const text = "開業は 2015-03-14 です。";
    const facts = extractFacts(text);
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.value.includes("2015"))).toBe(true);
  });

  it("数値+単位パターンを抽出する / extracts numeric patterns with units", () => {
    const text = "富士山の標高は 3,776m である。";
    const facts = extractFacts(text);
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.value.includes("3,776m"))).toBe(true);
  });

  it("人口の数値を抽出する / extracts population numbers", () => {
    const text = "東京都の人口は約 1,400万人 です。";
    const facts = extractFacts(text);
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.value.includes("万"))).toBe(true);
  });

  it("コンテキストが短すぎる場合はスキップする / skips when context is too short", () => {
    const text = "3,776m";
    const facts = extractFacts(text);
    // コンテキスト（先行テキスト）がないためスキップされる
    // Skipped because there is no preceding context
    expect(facts).toEqual([]);
  });

  it("複数のファクトを同時に抽出する / extracts multiple facts", () => {
    const text = "東京タワーの高さは 333m で、1958年12月23日 に完成した。";
    const facts = extractFacts(text);
    expect(facts.length).toBeGreaterThanOrEqual(2);
  });
});
