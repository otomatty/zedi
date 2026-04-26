/**
 * formatDate のテスト。
 * Tests for formatDate.
 */
import { describe, it, expect } from "vitest";
import { formatDate } from "./dateUtils";

describe("formatDate", () => {
  it("ISO 8601 を YYYY/MM/DD（ja-JP）に整形する / formats ISO date in ja-JP locale", () => {
    expect(formatDate("2026-04-25T01:23:45Z")).toBe("2026/04/25");
  });

  it("月日が 1 桁でも 0 埋めされる / zero-pads single-digit month/day", () => {
    expect(formatDate("2026-01-02T00:00:00Z")).toBe("2026/01/02");
  });

  it("不正な日付文字列はそのまま返す / returns input as-is for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("空文字も入力をそのまま返す / returns empty input as-is", () => {
    expect(formatDate("")).toBe("");
  });
});
