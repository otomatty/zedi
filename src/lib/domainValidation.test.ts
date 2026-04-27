/**
 * Tests for the client-side domain validator (issue #663).
 * クライアント側ドメイン検証のテスト。
 */
import { describe, it, expect } from "vitest";
import { normalizeDomainInput } from "./domainValidation";

describe("normalizeDomainInput", () => {
  it("trims, lower-cases, and accepts a plain domain", () => {
    const result = normalizeDomainInput("  Example.COM  ");
    expect(result).toEqual({ ok: true, domain: "example.com" });
  });

  it("strips a single leading @ from email-style input", () => {
    const result = normalizeDomainInput("@example.com");
    expect(result).toEqual({ ok: true, domain: "example.com" });
  });

  it("flags empty strings as empty", () => {
    expect(normalizeDomainInput("")).toEqual({ ok: false, error: { kind: "empty" } });
    expect(normalizeDomainInput("   ")).toEqual({ ok: false, error: { kind: "empty" } });
    expect(normalizeDomainInput(undefined)).toEqual({ ok: false, error: { kind: "empty" } });
  });

  it("rejects malformed domains", () => {
    expect(normalizeDomainInput("not-a-domain")).toEqual({
      ok: false,
      error: { kind: "invalid_format" },
    });
    expect(normalizeDomainInput("example.")).toEqual({
      ok: false,
      error: { kind: "invalid_format" },
    });
  });

  it("rejects free webmail providers (gmail, outlook, yahoo, …)", () => {
    expect(normalizeDomainInput("gmail.com")).toEqual({
      ok: false,
      error: { kind: "free_email", domain: "gmail.com" },
    });
    expect(normalizeDomainInput("@yahoo.co.jp")).toEqual({
      ok: false,
      error: { kind: "free_email", domain: "yahoo.co.jp" },
    });
    expect(normalizeDomainInput("OUTLOOK.com")).toEqual({
      ok: false,
      error: { kind: "free_email", domain: "outlook.com" },
    });
  });
});
