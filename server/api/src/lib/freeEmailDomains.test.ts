/**
 * `freeEmailDomains` の単体テスト。
 * ドメイン入力正規化とフリーメール拒否リストの境界条件を検証する。
 *
 * Unit tests for `freeEmailDomains.ts` (issue #663). Focus on input
 * normalisation and the free-webmail deny-list boundaries.
 */
import { describe, it, expect } from "vitest";
import {
  FREE_EMAIL_DOMAINS,
  extractEmailDomain,
  normalizeDomainInput,
} from "./freeEmailDomains.js";

describe("normalizeDomainInput", () => {
  it("lower-cases and returns a valid domain", () => {
    const result = normalizeDomainInput("Example.COM");
    expect(result).toEqual({ ok: true, domain: "example.com" });
  });

  it("strips a single leading @ from input", () => {
    const result = normalizeDomainInput("@example.com");
    expect(result).toEqual({ ok: true, domain: "example.com" });
  });

  it("trims surrounding whitespace", () => {
    const result = normalizeDomainInput("   example.com  ");
    expect(result).toEqual({ ok: true, domain: "example.com" });
  });

  it("rejects empty string", () => {
    const result = normalizeDomainInput("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("empty");
  });

  it("rejects a string that only contains '@'", () => {
    const result = normalizeDomainInput("@");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("empty");
  });

  it("rejects non-string input", () => {
    const result = normalizeDomainInput(123);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("empty");
  });

  it("rejects invalid format (no TLD)", () => {
    const result = normalizeDomainInput("localhost");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_format");
  });

  it("rejects invalid format (trailing dot)", () => {
    const result = normalizeDomainInput("example.com.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_format");
  });

  it("rejects invalid format (numeric-only TLD)", () => {
    const result = normalizeDomainInput("example.123");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_format");
  });

  it("rejects a free-webmail provider (gmail.com)", () => {
    const result = normalizeDomainInput("gmail.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("free_email");
      if (result.error.kind === "free_email") {
        expect(result.error.domain).toBe("gmail.com");
      }
    }
  });

  it("rejects a free-webmail provider case-insensitively", () => {
    const result = normalizeDomainInput("YAHOO.CO.JP");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("free_email");
  });

  it("accepts a multi-label corporate domain", () => {
    const result = normalizeDomainInput("corp.example.jp");
    expect(result).toEqual({ ok: true, domain: "corp.example.jp" });
  });

  it("FREE_EMAIL_DOMAINS includes the providers called out in the issue", () => {
    // Issue #663 に列挙されている代表的なフリーメール。
    // Representative providers called out in #663.
    expect(FREE_EMAIL_DOMAINS.has("gmail.com")).toBe(true);
    expect(FREE_EMAIL_DOMAINS.has("outlook.com")).toBe(true);
    expect(FREE_EMAIL_DOMAINS.has("yahoo.co.jp")).toBe(true);
    expect(FREE_EMAIL_DOMAINS.has("icloud.com")).toBe(true);
  });
});

describe("extractEmailDomain", () => {
  it("returns the lower-cased domain portion", () => {
    expect(extractEmailDomain("Alice@Example.COM")).toBe("example.com");
  });

  it("returns null for non-string input", () => {
    expect(extractEmailDomain(undefined)).toBeNull();
    expect(extractEmailDomain(null)).toBeNull();
  });

  it("returns null when the address has no @", () => {
    expect(extractEmailDomain("not-an-email")).toBeNull();
  });

  it("returns null when the address ends with @", () => {
    expect(extractEmailDomain("nobody@")).toBeNull();
  });

  it("returns null when the address starts with @", () => {
    expect(extractEmailDomain("@example.com")).toBeNull();
  });

  it("uses the last @ to split (quoted local-parts)", () => {
    // RFC 的には稀だが、lastIndexOf を使っていることを保証するテスト。
    // Guards against a future refactor switching to indexOf.
    expect(extractEmailDomain("a@b@example.com")).toBe("example.com");
  });
});
