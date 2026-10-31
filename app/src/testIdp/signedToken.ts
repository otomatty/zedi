/**
 * Compact HMAC-signed tokens for the test IdP: `base64url(json).base64url(hmac)`.
 * The IdP keeps no state, so codes and access tokens carry their own claims and expiry.
 * テスト用 IdP の署名付きトークン。状態を持たないため、コードとアクセストークンに中身と期限を載せる。
 */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** SHA-256 of `value`, base64url-encoded (the PKCE S256 transform). */
export async function sha256Base64Url(value: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signs `payload` with `secret`. */
export async function signToken(secret: string, payload: Record<string, unknown>): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Returns the payload of a token signed with `secret`, or null when the signature does not match
 * or the token is malformed. Expiry is checked by the caller.
 * 署名が一致すれば中身を返す。期限の確認は呼び出し側で行う。
 */
export async function verifyToken(
  secret: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(body),
  );
  if (!valid) return null;
  const bodyBytes = fromBase64Url(body);
  if (!bodyBytes) return null;
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(bodyBytes));
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
