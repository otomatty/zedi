/**
 * titleSimilar ルールの単体テスト（純粋関数 levenshtein + runTitleSimilarRule）。
 * Unit tests for the titleSimilar rule (pure `levenshtein` and the
 * DB-backed `runTitleSimilarRule`).
 */
import { describe, it, expect } from "vitest";
import {
  levenshtein,
  runTitleSimilarRule,
} from "../../../../services/lintEngine/rules/titleSimilar.js";
import { createMockDb } from "../../../createMockDb.js";
import type { Database } from "../../../../types/index.js";

describe("levenshtein", () => {
  it("同一文字列の距離は 0 / identical strings have distance 0", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("空文字列との距離は文字列長 / distance to empty string equals string length", () => {
    expect(levenshtein("", "hello")).toBe(5);
    expect(levenshtein("hello", "")).toBe(5);
  });

  it("両方空文字列の場合は 0 / both empty strings have distance 0", () => {
    expect(levenshtein("", "")).toBe(0);
  });

  it("1 文字の置換 / single character substitution", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("1 文字の挿入 / single character insertion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  it("1 文字の削除 / single character deletion", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("複数の編集操作 / multiple edit operations", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("日本語文字列 / Japanese strings", () => {
    expect(levenshtein("東京都", "東京府")).toBe(1);
  });

  it("完全に異なる文字列 / completely different strings", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });

  it("React と ReactJS の距離 / React vs ReactJS", () => {
    expect(levenshtein("react", "reactjs")).toBe(2);
  });
});

describe("runTitleSimilarRule", () => {
  /**
   * 2 ページ分のタイトル行を返す DB モックでルールを実行するヘルパー。
   * Runs the rule against a mock DB returning the given `{id, title}` rows.
   */
  async function runWith(rows: Array<{ id: string; title: string | null }>) {
    const { db } = createMockDb([rows]);
    return runTitleSimilarRule("owner-1", db as unknown as Database);
  }

  it("完全一致のタイトルは warn・distance 0 で報告する / exact-title pair is reported as warn with distance 0", async () => {
    const result = await runWith([
      { id: "a", title: "React" },
      { id: "b", title: "React" },
    ]);

    expect(result.rule).toBe("title_similar");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual({
      rule: "title_similar",
      severity: "warn",
      pageIds: ["a", "b"],
      detail: {
        titleA: "React",
        titleB: "React",
        distance: 0,
        suggestion:
          "タイトルが完全に一致しています。統合またはリネームを検討してください / Titles are identical. Consider merging or renaming.",
      },
    });
  });

  it("大文字小文字だけ違うタイトルも完全一致（distance 0）扱い / case-only differences count as exact match", async () => {
    const result = await runWith([
      { id: "a", title: "React" },
      { id: "b", title: "react" },
    ]);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warn");
    expect(result.findings[0]?.detail.distance).toBe(0);
    // 表示用には元の綴りを保持する / original spelling is preserved in the detail
    expect(result.findings[0]?.detail.titleA).toBe("React");
    expect(result.findings[0]?.detail.titleB).toBe("react");
  });

  it("編集距離が閾値ちょうどなら info で報告する / distance == threshold is reported as info", async () => {
    // minLen=10 → threshold = floor(10 * 0.3) = 3。距離ちょうど 3 は閾値内。
    // minLen=10 → threshold 3; a distance of exactly 3 is within range.
    const result = await runWith([
      { id: "a", title: "abcdefghij" },
      { id: "b", title: "abcdefgxyz" },
    ]);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.detail.distance).toBe(3);
    expect(result.findings[0]?.detail.suggestion).toBe(
      "タイトルが類似しています。統合を検討してください / Titles are similar. Consider merging.",
    );
  });

  it("編集距離が閾値 + 1 なら報告しない / distance == threshold + 1 is not reported", async () => {
    // minLen=10 → threshold 3。距離 4（閾値 + 1）は範囲外。
    // minLen=10 → threshold 3; a distance of 4 falls outside the range.
    const result = await runWith([
      { id: "a", title: "abcdefghij" },
      { id: "b", title: "abcdefwxyz" },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("短いタイトルでは閾値が下限 1 にクランプされる / threshold is clamped to a minimum of 1 for short titles", async () => {
    // minLen=3 → floor(3 * 0.3) = 0 → Math.max(1, 0) = 1。距離 1 は閾値内。
    // minLen=3 → floor 0 → clamped to 1; a distance of 1 is within range.
    const result = await runWith([
      { id: "a", title: "cat" },
      { id: "b", title: "bat" },
    ]);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.detail.distance).toBe(1);
    expect(result.findings[0]?.severity).toBe("info");
  });

  it("短いタイトルで距離が下限を超えれば報告しない / short titles beyond the clamped threshold are not reported", async () => {
    // minLen=3 → threshold 1。距離 3 は範囲外。
    // minLen=3 → threshold 1; a distance of 3 is outside the range.
    const result = await runWith([
      { id: "a", title: "cat" },
      { id: "b", title: "dog" },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("空白のみ／空のタイトルは比較対象から除外する / blank titles are excluded from comparison", async () => {
    const result = await runWith([
      { id: "a", title: "   " },
      { id: "b", title: "" },
      { id: "c", title: "React" },
    ]);

    expect(result.findings).toEqual([]);
  });

  it("同じペアを二重に報告しない / a pair is reported at most once", async () => {
    // 3 ページが相互に完全一致でも、(a,b)(a,c)(b,c) の各ペアは 1 回ずつ。
    // Three identical titles yield exactly the three distinct pairs, no dupes.
    const result = await runWith([
      { id: "a", title: "React" },
      { id: "b", title: "React" },
      { id: "c", title: "React" },
    ]);

    expect(result.findings).toHaveLength(3);
    const pairs = result.findings.map((f) => f.pageIds.join(":")).sort();
    expect(pairs).toEqual(["a:b", "a:c", "b:c"]);
  });

  it("ページが 1 件以下なら検出なし / no findings with fewer than two titled pages", async () => {
    const result = await runWith([{ id: "a", title: "React" }]);

    expect(result.findings).toEqual([]);
  });
});
