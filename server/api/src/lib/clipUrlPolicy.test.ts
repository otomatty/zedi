/**
 * clipUrlPolicy (SSRF 対策) の単体テスト
 * Unit tests for clip URL policy / SSRF protection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isClipUrlAllowed, isClipUrlAllowedAfterDns } from "./clipUrlPolicy.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

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

    it("returns false for 127.0.0.0/8 (loopback)", () => {
      expect(isClipUrlAllowed("http://127.0.0.1")).toBe(false);
      expect(isClipUrlAllowed("http://127.0.0.1:8080/page")).toBe(false);
      expect(isClipUrlAllowed("http://127.0.0.2")).toBe(false);
      expect(isClipUrlAllowed("http://127.255.255.255")).toBe(false);
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

    it("returns false for IPv6 ULA (fc00::/7, RFC 4193)", () => {
      expect(isClipUrlAllowed("http://[fd00::1]")).toBe(false);
      expect(isClipUrlAllowed("http://[fc00::1]/")).toBe(false);
    });

    it("returns false for 0.0.0.0, [::], IPv4-mapped IPv6", () => {
      expect(isClipUrlAllowed("http://0.0.0.0")).toBe(false);
      expect(isClipUrlAllowed("http://0.0.0.0:8080/")).toBe(false);
      expect(isClipUrlAllowed("http://[::]/")).toBe(false);
      expect(isClipUrlAllowed("http://[::ffff:127.0.0.1]/")).toBe(false);
      expect(isClipUrlAllowed("http://[::ffff:10.0.0.1]/")).toBe(false);
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

  describe("isClipUrlAllowedAfterDns", () => {
    beforeEach(() => {
      vi.mocked(lookup).mockReset();
    });

    it("returns false when isClipUrlAllowed is false", async () => {
      expect(await isClipUrlAllowedAfterDns("http://localhost")).toBe(false);
      expect(await isClipUrlAllowedAfterDns("http://127.0.0.1")).toBe(false);
      expect(lookup).not.toHaveBeenCalled();
    });

    it("returns true when hostname is public IP and allowed", async () => {
      // 8.8.8.8 is public; isClipUrlAllowed allows public IPs. So 8.8.8.8 passes the sync check. Then isClipUrlAllowedAfterDns sees isIP("8.8.8.8") !== 0 and returns true without lookup.
      expect(await isClipUrlAllowedAfterDns("http://8.8.8.8")).toBe(true);
      expect(lookup).not.toHaveBeenCalled();
    });

    it("returns true when DNS resolves to public IP only", async () => {
      const result: LookupAddress[] = [{ address: "93.184.216.34", family: 4 }];
      vi.mocked(lookup).mockResolvedValue(result as unknown as import("node:dns").LookupAddress);
      expect(await isClipUrlAllowedAfterDns("https://example.com/path")).toBe(true);
    });

    it("returns false when DNS resolves to private IP", async () => {
      const result: LookupAddress[] = [{ address: "10.0.0.1", family: 4 }];
      vi.mocked(lookup).mockResolvedValue(result as unknown as import("node:dns").LookupAddress);
      expect(await isClipUrlAllowedAfterDns("https://internal.corp/page")).toBe(false);
    });

    it("returns false when DNS resolves to loopback", async () => {
      const result: LookupAddress[] = [{ address: "127.0.0.1", family: 4 }];
      vi.mocked(lookup).mockResolvedValue(result as unknown as import("node:dns").LookupAddress);
      expect(await isClipUrlAllowedAfterDns("https://evil.example.com/")).toBe(false);
    });

    it("returns false when any resolved address is private", async () => {
      const result: LookupAddress[] = [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.1", family: 4 },
      ];
      vi.mocked(lookup).mockResolvedValue(result as unknown as import("node:dns").LookupAddress);
      expect(await isClipUrlAllowedAfterDns("https://example.com/")).toBe(false);
    });

    it("returns false when DNS resolves to IPv6 ULA (fd00::/8)", async () => {
      const result: LookupAddress[] = [{ address: "fd00::1", family: 6 }];
      vi.mocked(lookup).mockResolvedValue(result as unknown as import("node:dns").LookupAddress);
      expect(await isClipUrlAllowedAfterDns("https://internal6.example/page")).toBe(false);
    });

    it("returns false when lookup throws", async () => {
      vi.mocked(lookup).mockRejectedValue(new Error("ENOTFOUND"));
      expect(await isClipUrlAllowedAfterDns("https://nonexistent.invalid.example/")).toBe(false);
    });
  });
});
