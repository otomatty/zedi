/**
 * Chrome 拡張用認証ライブラリの単体テスト
 * Unit tests for extension auth: PKCE, redirect_uri, JWT.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import {
  verifyPKCE,
  isRedirectUriAllowed,
  issueExtensionToken,
  verifyExtensionToken,
  type ExtensionTokenPayload,
} from "./extAuth.js";

/** base64url encode (no padding) - mirrors extAuth internal logic for test */
function sha256Base64url(str: string): string {
  const hash = createHash("sha256").update(str).digest();
  return hash.toString("base64url");
}

describe("extAuth", () => {
  describe("verifyPKCE", () => {
    it("returns true when code_verifier hashes to code_challenge", () => {
      const verifier = "a".repeat(43);
      const challenge = sha256Base64url(verifier);
      expect(verifyPKCE(verifier, challenge)).toBe(true);
    });

    it("returns false when code_verifier does not match code_challenge", () => {
      const verifier = "verifier-string";
      const challenge = sha256Base64url("other-string");
      expect(verifyPKCE(verifier, challenge)).toBe(false);
    });

    it("returns false when code_verifier or code_challenge is empty", () => {
      expect(verifyPKCE("", "anything")).toBe(false);
      expect(verifyPKCE("anything", "")).toBe(false);
      expect(verifyPKCE("", "")).toBe(false);
    });

    it("returns true for realistic PKCE pair", () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
      expect(verifyPKCE(verifier, challenge)).toBe(true);
    });
  });

  describe("isRedirectUriAllowed", () => {
    const origExtensionOrigin = process.env.EXTENSION_ORIGIN;
    const origNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      if (origExtensionOrigin !== undefined) {
        process.env.EXTENSION_ORIGIN = origExtensionOrigin;
      } else {
        delete process.env.EXTENSION_ORIGIN;
      }
      if (origNodeEnv !== undefined) {
        process.env.NODE_ENV = origNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    });

    it("rejects all when EXTENSION_ORIGIN is unset (fail-closed, any env)", () => {
      delete process.env.EXTENSION_ORIGIN;
      process.env.NODE_ENV = "development";
      expect(isRedirectUriAllowed("https://abcdef.chromiumapp.org/")).toBe(false);
      expect(isRedirectUriAllowed("https://xyz.chromiumapp.org")).toBe(false);
      process.env.NODE_ENV = "production";
      expect(isRedirectUriAllowed("https://abcdef.chromiumapp.org/")).toBe(false);
      expect(isRedirectUriAllowed("https://xyz.chromiumapp.org")).toBe(false);
    });

    it("rejects non-https or wrong host when EXTENSION_ORIGIN is unset", () => {
      delete process.env.EXTENSION_ORIGIN;
      process.env.NODE_ENV = "development";
      expect(isRedirectUriAllowed("http://abc.chromiumapp.org")).toBe(false);
      expect(isRedirectUriAllowed("https://evil.com")).toBe(false);
    });

    it("allows redirect_uri when EXTENSION_ORIGIN matches (comma-separated list)", () => {
      process.env.EXTENSION_ORIGIN = "https://abc.chromiumapp.org/,https://def.chromiumapp.org";
      expect(isRedirectUriAllowed("https://abc.chromiumapp.org/")).toBe(true);
      expect(isRedirectUriAllowed("https://def.chromiumapp.org")).toBe(true);
    });

    it("rejects redirect_uri when EXTENSION_ORIGIN is set and origin not in list", () => {
      process.env.EXTENSION_ORIGIN = "https://allowed.chromiumapp.org";
      expect(isRedirectUriAllowed("https://other.chromiumapp.org")).toBe(false);
      expect(isRedirectUriAllowed("https://evil.com")).toBe(false);
    });

    it("trims EXTENSION_ORIGIN entries", () => {
      process.env.EXTENSION_ORIGIN = "  https://a.chromiumapp.org  , https://b.chromiumapp.org  ";
      expect(isRedirectUriAllowed("https://a.chromiumapp.org/")).toBe(true);
      expect(isRedirectUriAllowed("https://b.chromiumapp.org/")).toBe(true);
    });
  });

  describe("issueExtensionToken / verifyExtensionToken", () => {
    const secret = "x".repeat(48);
    const origBetterAuthSecret = process.env.BETTER_AUTH_SECRET;

    beforeEach(() => {
      process.env.BETTER_AUTH_SECRET = secret;
    });

    afterEach(() => {
      if (origBetterAuthSecret !== undefined) {
        process.env.BETTER_AUTH_SECRET = origBetterAuthSecret;
      } else {
        delete process.env.BETTER_AUTH_SECRET;
      }
    });

    it("issues a token that verifyExtensionToken accepts", async () => {
      const { access_token, expires_in } = await issueExtensionToken("user-123");
      expect(typeof access_token).toBe("string");
      expect(access_token.length).toBeGreaterThan(0);
      expect(expires_in).toBeGreaterThan(0);

      const payload = await verifyExtensionToken(access_token);
      expect(payload).not.toBeNull();
      expect((payload as ExtensionTokenPayload).sub).toBe("user-123");
      expect((payload as ExtensionTokenPayload).scope).toContain("clip:create");
      expect((payload as ExtensionTokenPayload).aud).toBe("zedi-extension");
    });

    it("returns null for invalid or tampered token", async () => {
      expect(await verifyExtensionToken("invalid.jwt.token")).toBeNull();
      const { access_token } = await issueExtensionToken("user-1");
      const tampered = access_token.slice(0, -2) + "xx";
      expect(await verifyExtensionToken(tampered)).toBeNull();
    });

    it("returns null for token with wrong audience", async () => {
      const key = new TextEncoder().encode(secret);
      const token = await new SignJWT({ scope: ["clip:create"] })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("user-1")
        .setAudience("not-zedi-extension")
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(key);
      expect(await verifyExtensionToken(token)).toBeNull();
    });
  });
});
