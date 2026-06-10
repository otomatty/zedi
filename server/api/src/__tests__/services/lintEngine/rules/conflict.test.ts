/**
 * conflict ルールの単体テスト（純粋関数 extractFacts + runConflictRule）。
 * Unit tests for the conflict rule (pure `extractFacts` and the DB-backed
 * `runConflictRule`).
 */
import { describe, it, expect } from "vitest";
import { extractFacts, runConflictRule } from "../../../../services/lintEngine/rules/conflict.js";
import { createMockDb } from "../../../createMockDb.js";
import type { Database } from "../../../../types/index.js";

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

  it("空白区切りの thousand-grouping を正規化する / normalises whitespace-separated numbers", () => {
    // `1 000 円` も `1,000円` / `1000円` と同じ事実として扱う。
    // `1 000 円` must collapse to the same canonical value as other variants.
    const a = extractFacts("月額料金は 1 000 円 です。");
    const b = extractFacts("月額料金は 1,000円 です。");
    expect(a[0]?.value).toBe("1000円");
    expect(a[0]?.value).toBe(b[0]?.value);
  });

  it("百万単位の空白区切りを正規化する / normalises million-scale grouped numbers", () => {
    const facts = extractFacts("年間売上は 1 000 000 円 です。");
    expect(facts[0]?.value).toBe("1000000円");
  });

  it("末尾の小数ゼロを正規化する / normalises trailing decimal zeros", () => {
    // `1000.0円` と `1000円` は同じ数値を指す。parseFloat で末尾ゼロを畳む。
    // `1000.0円` and `1000円` denote the same number; parseFloat canonicalises.
    const a = extractFacts("月額料金は 1000.0円 です。");
    const b = extractFacts("月額料金は 1000円 です。");
    expect(a[0]?.value).toBe("1000円");
    expect(a[0]?.value).toBe(b[0]?.value);
  });

  it("小数を含む数値を正規化する / normalises decimal numbers", () => {
    const a = extractFacts("富士山の標高は 3.776km である。");
    const b = extractFacts("富士山の標高は 3.7760km である。");
    expect(a[0]?.value).toBe("3.776km");
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

describe("runConflictRule", () => {
  /**
   * `{id, title, contentText}` 行を返す DB モックでルールを実行するヘルパー。
   * Runs the rule against a mock DB returning the given joined page rows.
   */
  async function runWith(
    rows: Array<{ id: string; title: string | null; contentText: string | null }>,
  ) {
    const { db } = createMockDb([rows]);
    return runConflictRule("owner-1", db as unknown as Database);
  }

  it("同じ事柄に異なる値を持つ 2 ページを矛盾として報告する / reports two pages disagreeing on the same fact", async () => {
    const result = await runWith([
      { id: "p1", title: "タワー (旧)", contentText: "東京タワーの高さは 333m です。" },
      { id: "p2", title: null, contentText: "東京タワーの高さは 300m です。" },
    ]);

    expect(result.rule).toBe("conflict");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual({
      rule: "conflict",
      severity: "warn",
      pageIds: ["p1", "p2"],
      detail: {
        factKey: "東京タワーの高さは",
        claims: [
          { pageId: "p1", title: "タワー (旧)", value: "333m" },
          // title が null のページは "(無題 / untitled)" にフォールバックする。
          // A null page title falls back to the "(無題 / untitled)" placeholder.
          { pageId: "p2", title: "(無題 / untitled)", value: "300m" },
        ],
        suggestion:
          "同じ事柄に異なる値が記載されています。確認してください / Different values found for the same fact. Please verify.",
      },
    });
  });

  it("同じ事柄に同じ値なら矛盾としない / does not report when both pages agree on the value", async () => {
    const result = await runWith([
      { id: "p1", title: "A", contentText: "東京タワーの高さは 333m です。" },
      { id: "p2", title: "B", contentText: "東京タワーの高さは 333m です。" },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("1 ページ内だけで値が食い違ってもページ跨ぎでなければ報告しない / a single page disagreeing with itself is not a cross-page conflict", async () => {
    // 同一キーで 2 つの異なる値を持つが、出所が 1 ページなので報告対象外。
    // Same key, two differing values, but only one distinct page → not reported.
    const result = await runWith([
      {
        id: "p1",
        title: "A",
        contentText: `コストは 100円${" ".repeat(20)}コストは 200円`,
      },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("同じキーの主張が 1 件だけなら矛盾としない / a single claim for a key is not a conflict", async () => {
    const result = await runWith([
      { id: "p1", title: "A", contentText: "東京タワーの高さは 333m です。" },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("contentText が null のページはスキップする / skips pages with null contentText", async () => {
    const result = await runWith([
      { id: "p1", title: "A", contentText: null },
      { id: "p2", title: "B", contentText: "東京タワーの高さは 300m です。" },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("ファクトが無ければ検出なし / no findings when no facts are present", async () => {
    const result = await runWith([
      { id: "p1", title: "A", contentText: "特に数値はありません。" },
      { id: "p2", title: "B", contentText: "ここにも数値はありません。" },
    ]);

    expect(result.findings).toEqual([]);
  });
});
