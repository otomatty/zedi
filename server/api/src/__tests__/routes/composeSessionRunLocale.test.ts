/**
 * Unit tests for compose session locale preparation helper.
 */
import { describe, expect, it } from "vitest";
import {
  prepareComposeRunFromRequest,
  resolveComposeSessionContentLocale,
} from "../../routes/composeSessionRunLocale.js";

describe("prepareComposeRunFromRequest", () => {
  it("strips contentLocale from graph input and builds metadata patch on first run", () => {
    const prep = prepareComposeRunFromRequest(
      { composeSeed: { outline: "a", conversationText: "b" } },
      { contentLocale: "en", chatSeed: { outline: "a", conversationText: "b" } },
      "ja-JP",
      "ja",
    );
    expect(prep.contentLocale).toBe("en");
    expect(prep.graphInput).toEqual({ chatSeed: { outline: "a", conversationText: "b" } });
    expect(prep.metadataUpdate).toEqual({
      composeSeed: { outline: "a", conversationText: "b" },
      contentLocale: "en",
    });
  });

  it("skips metadata patch when locale is already persisted", () => {
    const prep = prepareComposeRunFromRequest(
      { contentLocale: "ja" },
      { contentLocale: "en" },
      null,
      "ja",
    );
    expect(prep.contentLocale).toBe("ja");
    expect(prep.metadataUpdate).toBeUndefined();
  });
});

describe("resolveComposeSessionContentLocale", () => {
  it("delegates to session metadata when present", () => {
    expect(resolveComposeSessionContentLocale({ contentLocale: "en" }, null, "ja", "ja")).toBe(
      "en",
    );
  });
});
