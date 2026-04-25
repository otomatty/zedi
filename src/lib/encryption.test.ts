import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt, clearEncryptionKey } from "./encryption";

const hasSubtle = typeof globalThis.crypto?.subtle !== "undefined";
const ENCRYPTION_KEY_NAME = "zedi-encryption-key";
const IV_LENGTH = 12;

/**
 * Decode a Base64 ciphertext into the underlying byte array.
 * Base64 文字列を生バイト列に戻す（IV と暗号化データの境界検証に使う）。
 */
function decodeBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

describe("encryption", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("round-trip", () => {
    it.skipIf(!hasSubtle)("encrypt then decrypt returns original plaintext", async () => {
      const plaintext = "Hello, World!";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it.skipIf(!hasSubtle)("works with empty string (decrypt returns '')", async () => {
      // 空文字でも IV 付きで暗号化され、復号で空文字に戻る。
      // Pin that empty input round-trips to empty output (catches off-by-one slice mutations).
      const encrypted = await encrypt("");
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe("");
      // 暗号文の長さは IV(12B) + GCM tag(16B) = 28B 以上のはず。
      // Even an empty plaintext yields at least 28 bytes (IV + 16-byte tag).
      expect(decodeBase64(encrypted).length).toBeGreaterThanOrEqual(IV_LENGTH + 16);
    });

    it.skipIf(!hasSubtle)("works with unicode (multibyte) text", async () => {
      const plaintext = "日本語テスト 🎉 émojis & spëcial chars";
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("IV semantics", () => {
    it.skipIf(!hasSubtle)(
      "produces a fresh IV per call (different ciphertexts for same input)",
      async () => {
        // 同一平文でも IV が毎回ランダムに生成されるため出力は異なる。
        // Kills mutations to `crypto.getRandomValues` (e.g., zero-IV) and the IV-length constant.
        const a = await encrypt("Same input");
        const b = await encrypt("Same input");
        expect(a).not.toBe(b);

        // 先頭 IV_LENGTH バイト (= IV) が異なることを直接検証する。
        // Pin that the first 12 bytes (the IV) differ between calls.
        const ivA = decodeBase64(a).slice(0, IV_LENGTH);
        const ivB = decodeBase64(b).slice(0, IV_LENGTH);
        expect(Array.from(ivA)).not.toEqual(Array.from(ivB));
      },
    );

    it.skipIf(!hasSubtle)(
      "prepends the IV (not appends) and produces non-zero IV bytes",
      async () => {
        // IV は先頭に置かれ (`combined.set(iv, 0)`)、暗号化データはその後ろに続く
        // (`combined.set(encryptedData, iv.length)`)。両 set 呼び出しのオフセット変異を殺す。
        // Kills mutations to the offsets in the two `combined.set(...)` calls.
        const ciphertext = await encrypt("payload");
        const bytes = decodeBase64(ciphertext);

        // 先頭 12 バイトはランダム IV である (= 全部 0 ではない)。
        // The first 12 bytes form a random IV — not all zeros.
        const iv = bytes.slice(0, IV_LENGTH);
        expect(iv.length).toBe(IV_LENGTH);
        expect(iv.some((b) => b !== 0)).toBe(true);

        // IV を別物に書き換えると AES-GCM の認証タグ検証が必ず失敗する。
        // Tampering the IV must trigger an authentication failure on decrypt.
        const tampered = new Uint8Array(bytes);
        tampered[0] ^= 0xff;
        const tamperedB64 = btoa(String.fromCharCode(...tampered));
        await expect(decrypt(tamperedB64)).rejects.toBeDefined();
      },
    );

    it.skipIf(!hasSubtle)("reads the IV from the FIRST 12 bytes on decrypt", async () => {
      // 復号時の `combined.slice(0, IV_LENGTH)` と `combined.slice(IV_LENGTH)` の境界を検証する。
      // Truncating the first byte (so the IV starts at offset 1) must fail to decrypt.
      // Kills mutations to the slice arguments on decrypt.
      const ciphertext = await encrypt("payload");
      const bytes = decodeBase64(ciphertext);
      const shifted = bytes.slice(1); // 先頭 1 バイト落とす → IV 領域がズレる
      const shiftedB64 = btoa(String.fromCharCode(...shifted));
      await expect(decrypt(shiftedB64)).rejects.toBeDefined();
    });
  });

  describe("authentication / tamper resistance", () => {
    it.skipIf(!hasSubtle)(
      "decrypt throws when the encrypted data portion is tampered",
      async () => {
        // GCM の認証タグにより、暗号化データの 1 バイト改竄でも復号は失敗する。
        // Pin that AES-GCM tag verification rejects payload tampering.
        const ciphertext = await encrypt("authenticated payload");
        const bytes = decodeBase64(ciphertext);
        const tampered = new Uint8Array(bytes);
        // IV ではなく暗号化データ部 (offset = IV_LENGTH 以降) を 1 バイト改竄する。
        // Flip a bit in the encrypted-data portion (after the IV).
        tampered[IV_LENGTH] ^= 0x01;
        const tamperedB64 = btoa(String.fromCharCode(...tampered));
        await expect(decrypt(tamperedB64)).rejects.toBeDefined();
      },
    );
  });

  describe("key persistence and reuse", () => {
    it.skipIf(!hasSubtle)("stores the generated key in localStorage on first encrypt", async () => {
      // 初回 encrypt はキーを生成し localStorage に Base64 で保存する。
      // Pin the side effect that lets a future browser session decrypt past content.
      expect(localStorage.getItem(ENCRYPTION_KEY_NAME)).toBeNull();
      await encrypt("trigger key");
      expect(localStorage.getItem(ENCRYPTION_KEY_NAME)).not.toBeNull();
    });

    it.skipIf(!hasSubtle)(
      "reuses the stored key on subsequent encrypt calls (does not regenerate)",
      async () => {
        // 2 回目以降の encrypt は `if (storedKey)` 分岐に入り、保存済みキーをインポートして使う。
        // Pin the stored-key branch; without this test it stays NoCoverage / killed by removal.
        await encrypt("first");
        const keyAfterFirst = localStorage.getItem(ENCRYPTION_KEY_NAME);
        expect(keyAfterFirst).not.toBeNull();

        await encrypt("second");
        const keyAfterSecond = localStorage.getItem(ENCRYPTION_KEY_NAME);
        expect(keyAfterSecond).toBe(keyAfterFirst);
      },
    );

    it.skipIf(!hasSubtle)(
      "decrypts ciphertext produced by an earlier encrypt call (key reuse end-to-end)",
      async () => {
        // 同一プロセス内で 2 つの異なる暗号文が同じキーで復号できることを確認する。
        // End-to-end check that the stored-key branch is functional, not just present.
        const ct1 = await encrypt("alpha");
        const ct2 = await encrypt("beta");
        expect(await decrypt(ct1)).toBe("alpha");
        expect(await decrypt(ct2)).toBe("beta");
      },
    );

    it.skipIf(!hasSubtle)(
      "regenerates a new key after clearEncryptionKey, breaking old ciphertext",
      async () => {
        // クリア後は新しいキーが生成され、過去の暗号文は復号できなくなる。
        // Pin both: (1) clearEncryptionKey removes the stored key, (2) new encrypt
        // generates a fresh key (different bytes) so old ciphertext fails to decrypt.
        const ct = await encrypt("before clear");
        const oldKey = localStorage.getItem(ENCRYPTION_KEY_NAME);
        expect(oldKey).not.toBeNull();

        clearEncryptionKey();
        expect(localStorage.getItem(ENCRYPTION_KEY_NAME)).toBeNull();

        await encrypt("after clear");
        const newKey = localStorage.getItem(ENCRYPTION_KEY_NAME);
        expect(newKey).not.toBeNull();
        expect(newKey).not.toBe(oldKey);

        // 古い暗号文は新しいキーでは復号できない。
        // Old ciphertext must fail under the new key.
        await expect(decrypt(ct)).rejects.toBeDefined();
      },
    );
  });

  describe("clearEncryptionKey", () => {
    it("removes the key from localStorage when present", async () => {
      // クリアにより localStorage の該当キーが削除される。
      // Pin the side effect of clearEncryptionKey (key name and removal semantics).
      if (hasSubtle) {
        await encrypt("trigger key generation");
        expect(localStorage.getItem(ENCRYPTION_KEY_NAME)).not.toBeNull();
      } else {
        localStorage.setItem(ENCRYPTION_KEY_NAME, "dummy");
      }
      clearEncryptionKey();
      expect(localStorage.getItem(ENCRYPTION_KEY_NAME)).toBeNull();
    });

    it("is a no-op (no throw) when no key is stored", () => {
      // 未保存状態でもエラーにならず、なにも起こらない。
      // Pin the no-op semantics so a stricter "must exist" mutation surfaces.
      localStorage.clear();
      expect(() => clearEncryptionKey()).not.toThrow();
      expect(localStorage.getItem(ENCRYPTION_KEY_NAME)).toBeNull();
    });
  });
});
