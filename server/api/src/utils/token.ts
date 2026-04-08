/**
 * 招待トークン生成ユーティリティ
 * Invitation token generation utility
 */
import { randomBytes } from "node:crypto";

/**
 * URL セーフなランダムトークンを生成する
 * Generate a URL-safe random token
 *
 * @param byteLength - トークンのバイト長（デフォルト: 32） / Token byte length (default: 32)
 * @returns URL セーフな Base64 文字列 / URL-safe Base64 string
 */
export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/**
 * 招待トークンの有効期限を計算する
 * Calculate invitation token expiration date
 *
 * @param days - 有効日数（デフォルト: 7） / Number of valid days (default: 7)
 * @returns 有効期限の Date オブジェクト / Expiration Date object
 */
export function getTokenExpiresAt(days = 7): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

/**
 * トークンが期限切れかどうかを判定する
 * Check whether a token has expired
 *
 * @param expiresAt - 有効期限 / Expiration date
 * @returns 期限切れなら true / true if expired
 */
export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}
