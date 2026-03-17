import { describe, it, expect } from "vitest";
import {
  isValidUrl,
  isClipUrlAllowed,
  extractOGPData,
  clipWebPage,
  getClipErrorMessage,
} from "./webClipper";

describe("webClipper", () => {
  describe("isClipUrlAllowed", () => {
    it("returns true for http URLs", () => {
      expect(isClipUrlAllowed("http://example.com")).toBe(true);
    });

    it("returns true for https URLs", () => {
      expect(isClipUrlAllowed("https://example.com/article")).toBe(true);
    });

    it("returns false for chrome://", () => {
      expect(isClipUrlAllowed("chrome://extensions")).toBe(false);
    });

    it("returns false for about:", () => {
      expect(isClipUrlAllowed("about:blank")).toBe(false);
    });

    it("returns false for file://", () => {
      expect(isClipUrlAllowed("file:///tmp/test.html")).toBe(false);
    });

    it("returns false for localhost", () => {
      expect(isClipUrlAllowed("http://localhost:3000")).toBe(false);
    });

    it("returns false for 127.0.0.1", () => {
      expect(isClipUrlAllowed("http://127.0.0.1/page")).toBe(false);
    });

    it("returns false for private IP 192.168.x.x", () => {
      expect(isClipUrlAllowed("http://192.168.1.1/")).toBe(false);
    });

    it("returns false for private IP 10.x.x.x", () => {
      expect(isClipUrlAllowed("https://10.0.0.1/page")).toBe(false);
    });

    it("returns false for private IP 172.16–31.x.x", () => {
      expect(isClipUrlAllowed("http://172.16.0.1/")).toBe(false);
    });

    it("returns false for IPv6 ULA including short form (fc::1, fd::1)", () => {
      expect(isClipUrlAllowed("http://[fc::1]/")).toBe(false);
      expect(isClipUrlAllowed("http://[fd::1]")).toBe(false);
      expect(isClipUrlAllowed("http://[fd00::1]")).toBe(false);
    });

    it("returns true for domain starting with fc/fd (no false positive)", () => {
      expect(isClipUrlAllowed("https://fcb.example.com")).toBe(true);
      expect(isClipUrlAllowed("https://fd0.network")).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(isClipUrlAllowed("")).toBe(false);
      expect(isClipUrlAllowed("   ")).toBe(false);
    });
  });

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

    it("returns a generic message for unrecognized Error instances (no leak)", () => {
      const msg = getClipErrorMessage(new Error("Something else"));
      expect(msg).toBe("エラーが発生しました。しばらくしてから再試行してください。");
    });
  });

  describe("clipWebPage", () => {
    it("throws for invalid URL", async () => {
      await expect(clipWebPage("not-a-url")).rejects.toThrow("有効なURL");
    });
  });
});
