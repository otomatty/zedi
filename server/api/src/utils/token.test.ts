/**
 * token ユーティリティの単体テスト
 * Unit tests for token utility
 */
import { describe, it, expect } from "vitest";
import { generateToken, getTokenExpiresAt, isTokenExpired } from "./token.js";

describe("generateToken", () => {
  it("URL セーフな Base64 文字列を返す", () => {
    const token = generateToken();
    // Base64url: A-Z, a-z, 0-9, -, _ のみ（= パディングなし）
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("デフォルトで 32 バイト（約 43 文字）のトークンを生成する", () => {
    const token = generateToken();
    // 32 bytes = 43 base64url chars (ceil(32 * 4/3) = 43)
    expect(token.length).toBe(43);
  });

  it("指定したバイト長のトークンを生成できる", () => {
    const token = generateToken(16);
    // 16 bytes = 22 base64url chars
    expect(token.length).toBe(22);
  });

  it("毎回異なるトークンを生成する", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("getTokenExpiresAt", () => {
  it("デフォルトで 7 日後の日時を返す", () => {
    const now = Date.now();
    const expiresAt = getTokenExpiresAt();
    const diff = expiresAt.getTime() - now;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    // 実行時間の誤差を許容（1 秒以内）
    expect(Math.abs(diff - sevenDaysMs)).toBeLessThan(1000);
  });

  it("指定した日数後の日時を返す", () => {
    const now = Date.now();
    const expiresAt = getTokenExpiresAt(30);
    const diff = expiresAt.getTime() - now;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(diff - thirtyDaysMs)).toBeLessThan(1000);
  });
});

describe("isTokenExpired", () => {
  it("未来の日時は期限切れではない", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // 1時間後
    expect(isTokenExpired(future)).toBe(false);
  });

  it("過去の日時は期限切れ", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000); // 1時間前
    expect(isTokenExpired(past)).toBe(true);
  });
});
