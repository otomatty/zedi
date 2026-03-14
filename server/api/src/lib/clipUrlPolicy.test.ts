/**
 * clipUrlPolicy (SSRF 対策) の単体テスト
 * Unit tests for clip URL policy / SSRF protection.
 */
import { describe, it, expect } from "vitest";
import { isClipUrlAllowed } from "./clipUrlPolicy.js";

describe("clipUrlPolicy", () => {
  describe("isClipUrlAllowed", () => {
    it("returns true for http URLs", () => {
      expect(isClipUrlAllowed("http://example.com")).toBe(true);
      expect(isClipUrlAllowed("http://example.com/path")).toBe(true);
    });

    it("returns true for https URLs", () => {
      expect(isClipUrlAllowed("https://example.com")).toBe(true);
      expect(isClipUrlAllowed("https://sub.example.com/article")).toBe(true);
    });

    it("returns false for empty or whitespace", () => {
      expect(isClipUrlAllowed("")).toBe(false);
      expect(isClipUrlAllowed("   ")).toBe(false);
      expect(isClipUrlAllowed(null as unknown as string)).toBe(false);
      expect(isClipUrlAllowed(undefined as unknown as string)).toBe(false);
    });

    it("returns false for localhost", () => {
      expect(isClipUrlAllowed("http://localhost")).toBe(false);
      expect(isClipUrlAllowed("http://localhost:3000")).toBe(false);
      expect(isClipUrlAllowed("https://localhost/path")).toBe(false);
    });

    it("returns false for 127.0.0.1", () => {
      expect(isClipUrlAllowed("http://127.0.0.1")).toBe(false);
      expect(isClipUrlAllowed("http://127.0.0.1:8080/page")).toBe(false);
    });

    it("returns false for ::1 (IPv6 loopback)", () => {
      expect(isClipUrlAllowed("http://[::1]")).toBe(false);
      expect(isClipUrlAllowed("http://[::1]:3000")).toBe(false);
    });

    it("returns false for .localhost and .local", () => {
      expect(isClipUrlAllowed("http://app.localhost")).toBe(false);
      expect(isClipUrlAllowed("https://myservice.local")).toBe(false);
    });

    it("returns false for chrome://, about:, file:", () => {
      expect(isClipUrlAllowed("chrome://extensions")).toBe(false);
      expect(isClipUrlAllowed("about:blank")).toBe(false);
      expect(isClipUrlAllowed("file:///tmp/page.html")).toBe(false);
    });

    it("returns false for RFC 1918 private IPs (10.x)", () => {
      expect(isClipUrlAllowed("http://10.0.0.1")).toBe(false);
      expect(isClipUrlAllowed("https://10.1.2.3/path")).toBe(false);
    });

    it("returns false for RFC 1918 private IPs (192.168.x)", () => {
      expect(isClipUrlAllowed("http://192.168.0.1")).toBe(false);
      expect(isClipUrlAllowed("http://192.168.1.100")).toBe(false);
    });

    it("returns false for RFC 1918 private IPs (172.16–31.x)", () => {
      expect(isClipUrlAllowed("http://172.16.0.1")).toBe(false);
      expect(isClipUrlAllowed("http://172.31.255.255")).toBe(false);
      expect(isClipUrlAllowed("http://172.15.0.1")).toBe(true); // 172.15 is public
    });

    it("returns false for link-local (169.254.x)", () => {
      expect(isClipUrlAllowed("http://169.254.0.1")).toBe(false);
      expect(isClipUrlAllowed("http://169.254.1.2/")).toBe(false);
    });

    it("returns false for IPv6 link-local (fe80:)", () => {
      expect(isClipUrlAllowed("http://[fe80::1]")).toBe(false);
      expect(isClipUrlAllowed("http://[fe80::2%eth0]")).toBe(false);
    });

    it("returns false for non-http(s) protocols", () => {
      expect(isClipUrlAllowed("ftp://files.example.com")).toBe(false);
      expect(isClipUrlAllowed("javascript:alert(1)")).toBe(false);
    });

    it("trims input before parsing", () => {
      expect(isClipUrlAllowed("  https://example.com  ")).toBe(true);
      expect(isClipUrlAllowed("\thttp://example.com\n")).toBe(true);
    });

    it("returns false for invalid URL strings", () => {
      expect(isClipUrlAllowed("not a url")).toBe(false);
      expect(isClipUrlAllowed("://missing-scheme")).toBe(false);
    });
  });
});
