import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

/**
 * Encrypts TOTP secrets at rest with Better Auth's XChaCha20-Poly1305 helper, under a key
 * derived (HKDF-SHA256) from the auth secret for this purpose only.
 * 認証アプリの秘密鍵を暗号化して保存する。鍵は認証の秘密からこの用途専用に導く。
 */

const encoder = new TextEncoder();

async function purposeKey(authSecret: string): Promise<string> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(authSecret), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("zedi:second-factor"),
      info: encoder.encode("zedi:totp-secret:v1"),
    },
    base,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Encrypts `plaintext`; every call uses a fresh nonce. */
export async function sealSecret(authSecret: string, plaintext: string): Promise<string> {
  return symmetricEncrypt({ key: await purposeKey(authSecret), data: plaintext });
}

/** Decrypts a sealed secret, or returns null when it was tampered with or the key differs. */
export async function openSecret(authSecret: string, sealed: string): Promise<string | null> {
  try {
    return await symmetricDecrypt({ key: await purposeKey(authSecret), data: sealed });
  } catch {
    return null;
  }
}
