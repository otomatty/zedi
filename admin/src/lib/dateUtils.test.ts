/**
 * formatDate / formatNumber / getActiveLocale のテスト。
 * Tests for formatDate, formatNumber, and getActiveLocale.
 */
import { describe, it, expect, afterEach } from "vitest";
import i18n from "@/i18n";
import { formatDate, formatNumber, getActiveLocale } from "./dateUtils";

afterEach(async () => {
  // 他テストファイルが期待する ja への復帰を保証する。
  // Restore the global ja default so subsequent test files keep their assumptions.
  await i18n.changeLanguage("ja");
});

describe("getActiveLocale", () => {
  it("ja の時 ja-JP を返す / returns ja-JP when language is ja", async () => {
    await i18n.changeLanguage("ja");
    expect(getActiveLocale()).toBe("ja-JP");
  });

  it("en の時 en-US を返す / returns en-US when language is en", async () => {
    await i18n.changeLanguage("en");
    expect(getActiveLocale()).toBe("en-US");
  });

  it("未知言語は en-US にフォールバックする / falls back to en-US for unknown languages", async () => {
    await i18n.changeLanguage("fr");
    expect(getActiveLocale()).toBe("en-US");
  });
});

describe("formatDate", () => {
  it("ja で YYYY/MM/DD に整形する / formats as YYYY/MM/DD in ja", async () => {
    await i18n.changeLanguage("ja");
    expect(formatDate("2026-04-25T01:23:45Z")).toBe("2026/04/25");
  });

  it("ja で 1 桁の月日を 0 埋めする / zero-pads single-digit month/day in ja", async () => {
    await i18n.changeLanguage("ja");
    expect(formatDate("2026-01-02T00:00:00Z")).toBe("2026/01/02");
  });

  it("en で MM/DD/YYYY に整形する / formats as MM/DD/YYYY in en", async () => {
    await i18n.changeLanguage("en");
    expect(formatDate("2026-04-25T01:23:45Z")).toBe("04/25/2026");
  });

  it("不正な日付文字列はそのまま返す / returns input as-is for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("空文字も入力をそのまま返す / returns empty input as-is", () => {
    expect(formatDate("")).toBe("");
  });
});

describe("formatNumber", () => {
  it("ja でカンマ区切りに整形する / formats with comma separators in ja", async () => {
    await i18n.changeLanguage("ja");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("en でカンマ区切りに整形する / formats with comma separators in en", async () => {
    await i18n.changeLanguage("en");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it('0 は "0" を返す / returns "0" for zero', () => {
    expect(formatNumber(0)).toBe("0");
  });
});
