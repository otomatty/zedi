import { describe, it, expect } from "vitest";
import { isValidUrl, extractOGPData, clipWebPage, getClipErrorMessage } from "./webClipper";

describe("webClipper", () => {
  describe("isValidUrl", () => {
    it("returns true for http URLs", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
    });

    it("returns true for https URLs", () => {
      expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
    });

    it("returns false for ftp URLs", () => {
      expect(isValidUrl("ftp://files.example.com")).toBe(false);
    });

    it("returns false for javascript: URLs", () => {
      expect(isValidUrl("javascript:alert(1)")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidUrl("")).toBe(false);
    });

    it("returns false for random text", () => {
      expect(isValidUrl("not a url")).toBe(false);
    });
  });

  describe("extractOGPData", () => {
    it("extracts OGP meta tags from document", () => {
      const html = `<html><head>
        <meta property="og:title" content="Test Title" />
        <meta property="og:description" content="Test Desc" />
        <meta property="og:image" content="https://img.example.com/og.png" />
        <meta property="og:site_name" content="Example Site" />
      </head><body></body></html>`;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const ogp = extractOGPData(doc);
      expect(ogp.title).toBe("Test Title");
      expect(ogp.description).toBe("Test Desc");
      expect(ogp.image).toBe("https://img.example.com/og.png");
      expect(ogp.siteName).toBe("Example Site");
    });

    it("returns nulls when no OGP tags present", () => {
      const html = "<html><head></head><body></body></html>";
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const ogp = extractOGPData(doc);
      expect(ogp.title).toBeNull();
      expect(ogp.description).toBeNull();
      expect(ogp.image).toBeNull();
      expect(ogp.siteName).toBeNull();
    });

    it("falls back to meta name=description when og:description is missing", () => {
      const html = `<html><head>
        <meta name="description" content="Fallback description" />
      </head><body></body></html>`;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const ogp = extractOGPData(doc);
      expect(ogp.description).toBe("Fallback description");
    });
  });

  describe("getClipErrorMessage", () => {
    it("maps invalid URL errors to Japanese message", () => {
      const msg = getClipErrorMessage(new Error("有効なURLを入力してください"));
      expect(msg).toBe("有効なURLを入力してください。");
    });

    it("maps network errors to Japanese message", () => {
      const msg = getClipErrorMessage(new Error("Failed to fetch"));
      expect(msg).toContain("ネットワークエラー");
    });

    it("maps timeout errors to Japanese message", () => {
      const msg = getClipErrorMessage(new Error("Request timed out"));
      expect(msg).toContain("タイムアウト");
    });

    it("maps extraction failure errors", () => {
      const msg = getClipErrorMessage(new Error("本文の抽出に失敗"));
      expect(msg).toContain("本文の抽出に失敗");
    });

    it("returns generic message for unknown errors", () => {
      const msg = getClipErrorMessage("string error");
      expect(msg).toBe("予期しないエラーが発生しました。");
    });

    it("returns the error message for unrecognized Error instances", () => {
      const msg = getClipErrorMessage(new Error("Something else"));
      expect(msg).toBe("Something else");
    });
  });

  describe("clipWebPage", () => {
    it("throws for invalid URL", async () => {
      await expect(clipWebPage("not-a-url")).rejects.toThrow("有効なURL");
    });
  });
});
