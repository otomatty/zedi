import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";

/**
 * TOTP for authenticator apps (RFC 6238 with the common defaults: SHA-1, 6 digits, 30 s).
 * HOTP itself comes from `@better-auth/utils`; this module adds the step window and reports
 * which step matched, so a caller can refuse a code that was already used.
 * 認証アプリの TOTP。どのステップで一致したかを返し、使用済みのコードを拒めるようにする。
 */

const PERIOD_MS = 30_000;
const DIGITS = 6;
/** Steps accepted either side of the current one, for clock drift. */
const WINDOW = 1;

/** The 30-second step that contains `nowMs`. */
export const totpStep = (nowMs: number) => Math.floor(nowMs / PERIOD_MS);

/** A new secret: 160 random bits as unpadded Base32 (what authenticator apps expect). */
export function generateTotpSecret(): string {
  return base32.encode(crypto.getRandomValues(new Uint8Array(20)), { padding: false });
}

/** The code for `step`. */
export function totpCode(secret: string, step: number): Promise<string> {
  return createOTP(base32.decode(secret), { digits: DIGITS }).hotp(step);
}

/** Constant-time comparison of two equal-length digit strings. */
function sameCode(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/**
 * Returns the step `code` belongs to (the current step or one either side), or null.
 * Spaces are ignored; anything other than six ASCII digits is rejected.
 * コードが一致したステップ（現在とその前後）を返す。一致しなければ null。
 */
export async function matchTotp(
  secret: string,
  code: string,
  nowMs: number,
): Promise<number | null> {
  const digits = code.replace(/\s+/g, "");
  if (!/^[0-9]{6}$/.test(digits)) return null;
  const current = totpStep(nowMs);
  let matched: number | null = null;
  for (let step = current - WINDOW; step <= current + WINDOW; step++) {
    if (sameCode(digits, await totpCode(secret, step))) matched ??= step;
  }
  return matched;
}

/** The `otpauth://` URI that authenticator apps read from a QR code. */
export function totpUri({
  secret,
  account,
  issuer,
}: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_MS / 1000),
  });
  return `otpauth://totp/${label}?${params}`;
}
