import { describe, it, expect } from "vitest";
import {
  isPublicAnyLoggedInCombo,
  isShareableVisibility,
  shouldConfirmDefaultNotePublicSave,
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

  describe("isShareableVisibility", () => {
    it("returns true only for public / unlisted", () => {
      expect(isShareableVisibility("public")).toBe(true);
      expect(isShareableVisibility("unlisted")).toBe(true);
      expect(isShareableVisibility("private")).toBe(false);
      expect(isShareableVisibility("restricted")).toBe(false);
    });
  });

  describe("shouldConfirmDefaultNotePublicSave", () => {
    it("is false when the note is not the default note", () => {
      expect(shouldConfirmDefaultNotePublicSave(false, "public", "private")).toBe(false);
      expect(shouldConfirmDefaultNotePublicSave(false, "unlisted", "private")).toBe(false);
    });

    it("is false when the next visibility is private or restricted", () => {
      expect(shouldConfirmDefaultNotePublicSave(true, "private", "private")).toBe(false);
      expect(shouldConfirmDefaultNotePublicSave(true, "restricted", "private")).toBe(false);
    });

    it("is true when default note transitions from non-shareable to public/unlisted", () => {
      expect(shouldConfirmDefaultNotePublicSave(true, "public", "private")).toBe(true);
      expect(shouldConfirmDefaultNotePublicSave(true, "unlisted", "private")).toBe(true);
      expect(shouldConfirmDefaultNotePublicSave(true, "public", "restricted")).toBe(true);
      expect(shouldConfirmDefaultNotePublicSave(true, "unlisted", "restricted")).toBe(true);
    });

    it("is false when default note is already public or unlisted (re-save)", () => {
      expect(shouldConfirmDefaultNotePublicSave(true, "public", "public")).toBe(false);
      expect(shouldConfirmDefaultNotePublicSave(true, "unlisted", "unlisted")).toBe(false);
      expect(shouldConfirmDefaultNotePublicSave(true, "public", "unlisted")).toBe(false);
      expect(shouldConfirmDefaultNotePublicSave(true, "unlisted", "public")).toBe(false);
    });
  });
});
