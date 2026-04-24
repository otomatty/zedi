import { describe, expect, it } from "vitest";
import { resolveWelcomePageLocale } from "../content/welcomePage/index.js";

describe("resolveWelcomePageLocale", () => {
  it("returns 'ja' when the input is null or undefined", () => {
    expect(resolveWelcomePageLocale(null)).toBe("ja");
    expect(resolveWelcomePageLocale(undefined)).toBe("ja");
  });

  it("returns 'ja' as the fallback for empty strings", () => {
    expect(resolveWelcomePageLocale("")).toBe("ja");
  });

  it("returns 'en' for 'en' and 'en-US' style tags", () => {
    expect(resolveWelcomePageLocale("en")).toBe("en");
    expect(resolveWelcomePageLocale("en-US")).toBe("en");
    expect(resolveWelcomePageLocale("en_GB")).toBe("en");
    expect(resolveWelcomePageLocale("EN")).toBe("en");
  });

  it("returns 'ja' for 'ja' and 'ja-JP'", () => {
    expect(resolveWelcomePageLocale("ja")).toBe("ja");
    expect(resolveWelcomePageLocale("ja-JP")).toBe("ja");
  });

  it("falls back to 'ja' for unsupported locales", () => {
    expect(resolveWelcomePageLocale("fr")).toBe("ja");
    expect(resolveWelcomePageLocale("zh-CN")).toBe("ja");
    expect(resolveWelcomePageLocale("ko")).toBe("ja");
  });
});
