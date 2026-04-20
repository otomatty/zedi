/**
 * titleSimilar ルールの単体テスト（純粋関数 levenshtein のテスト）。
 * Unit tests for the titleSimilar rule (pure function levenshtein).
 */
import { describe, it, expect } from "vitest";
import { levenshtein } from "./titleSimilar.js";

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
