import { describe, expect, it } from "vitest";
import {
  encodePdfSectionAnchor,
  decodePdfSectionAnchor,
  isPdfSectionAnchor,
  PDF_SECTION_ANCHOR_PREFIX,
  PdfSectionAnchorError,
  MAX_PDF_SECTION_ANCHOR_LENGTH,
} from "./sectionAnchor";

describe("sectionAnchor", () => {
  const highlightId = "0d6c5d20-7e9b-4a3f-9d63-7f4b2c11ab90";

  describe("encodePdfSectionAnchor", () => {
    it("prefixes with pdf:v1: and embeds the highlight id", () => {
      expect(encodePdfSectionAnchor({ highlightId })).toBe(`pdf:v1:${highlightId}`);
    });

    it("rejects non-UUID highlight ids to avoid anchor collisions or injection", () => {
      expect(() => encodePdfSectionAnchor({ highlightId: "not-a-uuid" })).toThrow(
        PdfSectionAnchorError,
      );
      expect(() => encodePdfSectionAnchor({ highlightId: "" })).toThrow(PdfSectionAnchorError);
    });

    it("stays under the length budget used by the page_sources composite PK", () => {
      const encoded = encodePdfSectionAnchor({ highlightId });
      expect(encoded.length).toBeLessThanOrEqual(MAX_PDF_SECTION_ANCHOR_LENGTH);
    });
  });

  describe("decodePdfSectionAnchor", () => {
    it("round-trips encode/decode", () => {
      const encoded = encodePdfSectionAnchor({ highlightId });
      expect(decodePdfSectionAnchor(encoded)).toEqual({ version: 1, highlightId });
    });

    it("returns null for non-pdf anchors so callers can ignore unrelated rows", () => {
      expect(decodePdfSectionAnchor("")).toBeNull();
      expect(decodePdfSectionAnchor("heading-foo")).toBeNull();
      expect(decodePdfSectionAnchor("epub:v1:something")).toBeNull();
    });

    it("throws on a malformed pdf anchor (corrupted payload)", () => {
      expect(() => decodePdfSectionAnchor("pdf:v1:")).toThrow(PdfSectionAnchorError);
      expect(() => decodePdfSectionAnchor("pdf:v1:not-a-uuid")).toThrow(PdfSectionAnchorError);
    });

    it("throws on an unknown anchor version so older clients refuse new shapes", () => {
      expect(() => decodePdfSectionAnchor(`pdf:v2:${highlightId}`)).toThrow(PdfSectionAnchorError);
    });
  });

  describe("isPdfSectionAnchor", () => {
    it("returns true only for the well-formed pdf:v1 prefix", () => {
      expect(isPdfSectionAnchor(`${PDF_SECTION_ANCHOR_PREFIX}${highlightId}`)).toBe(true);
      expect(isPdfSectionAnchor("epub:v1:x")).toBe(false);
      expect(isPdfSectionAnchor("")).toBe(false);
    });
  });
});
