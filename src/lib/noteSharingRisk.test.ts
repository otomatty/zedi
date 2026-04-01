import { describe, it, expect } from "vitest";
import {
  isPublicAnyLoggedInCombo,
  shouldConfirmPublicAnyLoggedInSave,
} from "@/lib/noteSharingRisk";

describe("noteSharingRisk", () => {
  describe("isPublicAnyLoggedInCombo", () => {
    it("is true for public or unlisted with any_logged_in", () => {
      expect(isPublicAnyLoggedInCombo("public", "any_logged_in")).toBe(true);
      expect(isPublicAnyLoggedInCombo("unlisted", "any_logged_in")).toBe(true);
      expect(isPublicAnyLoggedInCombo("public", "owner_only")).toBe(false);
      expect(isPublicAnyLoggedInCombo("private", "any_logged_in")).toBe(false);
      expect(isPublicAnyLoggedInCombo("restricted", "any_logged_in")).toBe(false);
    });
  });

  describe("shouldConfirmPublicAnyLoggedInSave", () => {
    it("is false when combo is not public/unlisted + any_logged_in", () => {
      expect(
        shouldConfirmPublicAnyLoggedInSave("private", "any_logged_in", "private", "owner_only"),
      ).toBe(false);
    });

    it("is true when transitioning into public/unlisted + any_logged_in", () => {
      expect(
        shouldConfirmPublicAnyLoggedInSave("public", "any_logged_in", "private", "owner_only"),
      ).toBe(true);
      expect(
        shouldConfirmPublicAnyLoggedInSave("unlisted", "any_logged_in", "private", "owner_only"),
      ).toBe(true);
      expect(
        shouldConfirmPublicAnyLoggedInSave("public", "any_logged_in", "public", "members_editors"),
      ).toBe(true);
    });

    it("is false when already public or unlisted + any_logged_in", () => {
      expect(
        shouldConfirmPublicAnyLoggedInSave("public", "any_logged_in", "public", "any_logged_in"),
      ).toBe(false);
      expect(
        shouldConfirmPublicAnyLoggedInSave(
          "unlisted",
          "any_logged_in",
          "unlisted",
          "any_logged_in",
        ),
      ).toBe(false);
    });

    it("is false when switching between public and unlisted while staying any_logged_in", () => {
      expect(
        shouldConfirmPublicAnyLoggedInSave("unlisted", "any_logged_in", "public", "any_logged_in"),
      ).toBe(false);
    });
  });
});
