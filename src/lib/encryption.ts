// Web Crypto API を使用した暗号化ユーティリティ
// AES-256-GCM による暗号化/復号化

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // GCMの推奨IV長

// ブラウザごとに一意の暗号化キーを生成・保存
const ENCRYPTION_KEY_NAME = "zedi-encryption-key";

/**
 * 暗号化キーを取得または生成する
 */
async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const storedKey = localStorage.getItem(ENCRYPTION_KEY_NAME);

  if (storedKey) {
    // 保存されているキーをインポート
    const keyData = Uint8Array.from(atob(storedKey), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: ALGORITHM, length: KEY_LENGTH },
      true,
      ["encrypt", "decrypt"]
    );
  }

  // 新しいキーを生成
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );

  // キーをエクスポートして保存
  const exportedKey = await crypto.subtle.exportKey("raw", key);
  const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
  localStorage.setItem(ENCRYPTION_KEY_NAME, keyBase64);

  return key;
}

/**
 * 文字列を暗号化する
 * @param plaintext 暗号化する平文
 * @returns Base64エンコードされた暗号文（IV + 暗号化データ）
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();

  // ランダムなIVを生成
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // 平文をUint8Arrayに変換
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // 暗号化
  const encryptedData = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  // IV + 暗号化データを結合
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedData), iv.length);

  // Base64エンコード
  return btoa(String.fromCharCode(...combined));
}

/**
 * 暗号文を復号化する
 * @param ciphertext Base64エンコードされた暗号文
 * @returns 復号化された平文
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();

  // Base64デコード
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

  // IVと暗号化データを分離
  const iv = combined.slice(0, IV_LENGTH);
  const encryptedData = combined.slice(IV_LENGTH);

  // 復号化
  const decryptedData = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encryptedData
  );

  // Uint8Arrayを文字列に変換
  const decoder = new TextDecoder();
  return decoder.decode(decryptedData);
}

/**
 * 暗号化キーをクリアする（設定リセット時に使用）
 */
export function clearEncryptionKey(): void {
  localStorage.removeItem(ENCRYPTION_KEY_NAME);
}
