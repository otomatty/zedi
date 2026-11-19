/**
 * Recovery codes: shown once when the first second factor is set up, stored only as hashes,
 * and each usable once. 16 Crockford Base32 characters carry 80 random bits, enough that a
 * plain SHA-256 is safe to store.
 * 復旧用コード。登録時に一度だけ表示し、ハッシュだけを保存する。1 つにつき 1 回だけ使える。
 */

/** How many codes a user gets. */
export const RECOVERY_CODE_COUNT = 10;

// Crockford Base32: digits and letters without I, L, O and U.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 16;

/** New codes, formatted `XXXX-XXXX-XXXX-XXXX`. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
    const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
    return [0, 4, 8, 12].map((start) => chars.slice(start, start + 4)).join("-");
  });
}

/**
 * Reads a typed code: case, spaces and hyphens do not matter, and I, L and O read as 1, 1
 * and 0. Returns null when it cannot be a recovery code.
 */
function normalize(typed: string): string | null {
  const chars = typed
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  return chars.length === LENGTH && [...chars].every((c) => ALPHABET.includes(c)) ? chars : null;
}

/**
 * The SHA-256 (hex) stored for a code, however it was typed; null when `typed` cannot be a
 * recovery code.
 * 保存用のハッシュ。入力の書き方は問わない。コードとして読めなければ null。
 */
export async function hashRecoveryCode(typed: string): Promise<string | null> {
  const code = normalize(typed);
  if (!code) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
