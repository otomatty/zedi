import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

/**
 * Seals second-factor data with Better Auth's XChaCha20-Poly1305 helper, under a key derived
 * (HKDF-SHA256) from the auth secret for each purpose: authenticator app secrets at rest, and
 * offers of new recovery codes handed to the browser. A box opens only for its own purpose.
 * 2 段階目のデータを暗号化する。鍵は認証の秘密から用途ごとに導き、ほかの用途では開けない。
 */

const encoder = new TextEncoder();

/** What a box holds; each gets its own key. */
export type SealPurpose = "totp-secret" | "recovery-code-offer";

async function purposeKey(authSecret: string, purpose: SealPurpose): Promise<string> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(authSecret), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("zedi:second-factor"),
      info: encoder.encode(`zedi:${purpose}:v1`),
    },
    base,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Encrypts `plaintext` for `purpose`; every call uses a fresh nonce. */
export async function sealSecret(
  authSecret: string,
  plaintext: string,
  purpose: SealPurpose = "totp-secret",
): Promise<string> {
  return symmetricEncrypt({ key: await purposeKey(authSecret, purpose), data: plaintext });
}

/**
 * Decrypts a box sealed for `purpose`, or returns null when it was tampered with, the key
 * differs or it was sealed for another purpose.
 */
export async function openSecret(
  authSecret: string,
  sealed: string,
  purpose: SealPurpose = "totp-secret",
): Promise<string | null> {
  try {
    return await symmetricDecrypt({ key: await purposeKey(authSecret, purpose), data: sealed });
  } catch {
    return null;
  }
}
