import { describe, expect, it, vi, afterEach } from "vitest";
import i18n from "@/i18n";
import { resolveComposeContentLocale } from "./resolveComposeContentLocale";

describe("resolveComposeContentLocale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns en when i18n language is English", () => {
    vi.spyOn(i18n, "language", "get").mockReturnValue("en");
    expect(resolveComposeContentLocale()).toBe("en");
  });

  it("returns ja for Japanese and default locales", () => {
    vi.spyOn(i18n, "language", "get").mockReturnValue("ja");
    expect(resolveComposeContentLocale()).toBe("ja");
    vi.spyOn(i18n, "language", "get").mockReturnValue("ja-JP");
    expect(resolveComposeContentLocale()).toBe("ja");
  });
});
