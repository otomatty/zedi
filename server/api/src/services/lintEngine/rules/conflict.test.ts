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
    // カンマは正規化で除去されるため `3776m` として保存される。
    // Commas are normalized away so the canonical value is `3776m`.
    expect(facts.some((f) => f.value === "3776m")).toBe(true);
  });

  it("カンマ・空白違いを同一値として正規化する / normalises separator-only variants", () => {
    // `1,000円` と `1000円` は同じ事実なので、抽出後の value も同一文字列になる。
    // `1,000円` and `1000円` represent the same fact and should normalize equal.
    const a = extractFacts("月額料金は 1,000円 です。");
    const b = extractFacts("月額料金は 1000円 です。");
    expect(a[0]?.value).toBe("1000円");
    expect(b[0]?.value).toBe("1000円");
    expect(a[0]?.value).toBe(b[0]?.value);
  });

  it("日付の format 違いを同一値として正規化する / normalises date format variants", () => {
    const a = extractFacts("リリース日は 2026-04-19 です。");
    const b = extractFacts("リリース日は 2026/4/19 です。");
    const c = extractFacts("リリース日は 2026年4月19日 です。");
    expect(a[0]?.value).toBe("2026-4-19");
    expect(b[0]?.value).toBe("2026-4-19");
    expect(c[0]?.value).toBe("2026-4-19");
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
