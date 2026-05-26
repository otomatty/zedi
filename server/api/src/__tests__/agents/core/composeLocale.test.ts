import { describe, expect, it } from "vitest";
import {
  composeConflictRationale,
  composeContentLocaleInstruction,
  normalizeComposeContentLocale,
  readContentLocaleFromSessionMetadata,
  resolveComposeContentLocale,
  resolveSessionContentLocale,
  stripContentLocaleFromGraphInput,
  structureDialogueFallbackOutline,
} from "../../../agents/core/composeLocale.js";

describe("composeLocale", () => {
  it("normalizes supported locales only", () => {
    expect(normalizeComposeContentLocale("ja")).toBe("ja");
    expect(normalizeComposeContentLocale("en")).toBe("en");
    expect(normalizeComposeContentLocale("fr")).toBeNull();
  });

  it("resolves from input then Accept-Language", () => {
    expect(resolveComposeContentLocale({ contentLocale: "en" }, "ja-JP")).toBe("en");
    expect(resolveComposeContentLocale({}, "ja-JP,en;q=0.8")).toBe("ja");
    expect(resolveComposeContentLocale({}, "en-US,en;q=0.9")).toBe("en");
    expect(resolveComposeContentLocale({}, "zh-CN,en-US;q=0.9")).toBe("en");
    expect(resolveComposeContentLocale({}, null, "ja")).toBe("ja");
  });

  it("strips contentLocale from graph input", () => {
    expect(stripContentLocaleFromGraphInput({ contentLocale: "ja", chatSeed: { x: 1 } })).toEqual({
      chatSeed: { x: 1 },
    });
    expect(stripContentLocaleFromGraphInput(null)).toBeNull();
    expect(stripContentLocaleFromGraphInput(undefined)).toBeUndefined();
  });

  it("persists locale via session metadata resolution", () => {
    expect(readContentLocaleFromSessionMetadata({ contentLocale: "en" })).toBe("en");
    expect(
      resolveSessionContentLocale({ contentLocale: "en" }, { contentLocale: "ja" }, "ja-JP"),
    ).toBe("en");
    expect(resolveSessionContentLocale(null, { contentLocale: "ja" }, "en-US")).toBe("ja");
  });

  it("includes Japanese in locale instruction when ja", () => {
    expect(composeContentLocaleInstruction("ja")).toMatch(/Japanese/);
    expect(composeContentLocaleInstruction("en")).toMatch(/English/);
  });

  it("provides localized conflict rationale and fallback outline", () => {
    expect(composeConflictRationale("ja")).toMatch(/却下/);
    expect(structureDialogueFallbackOutline("ja")[0]?.heading).toBe("概要");
    expect(structureDialogueFallbackOutline("en")[0]?.heading).toBe("Overview");
  });
});
