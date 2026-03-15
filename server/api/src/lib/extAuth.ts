/**
 * Chrome 拡張用認証ライブラリ
 *
 * - ワンタイムコードの Redis 保存・取得
 * - PKCE 検証
 * - JWT 発行・検証
 *
 * Extension auth library for one-time code storage, PKCE verification, and JWT handling.
 */
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Redis } from "ioredis";
import { getEnv, getOptionalEnv } from "./env.js";

const CODE_TTL_SEC = 300; // 5 minutes
const JWT_EXP_DAYS = 7;
const EXT_SCOPE = "clip:create";

/** base64url encode (no padding) */
function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * PKCE: 与えられた code_verifier から code_challenge を計算し、期待値と一致するか検証する。
 * Verifies PKCE: SHA256(code_verifier) base64url === expected code_challenge.
 */
export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  const hash = createHash("sha256").update(codeVerifier).digest();
  const computed = base64urlEncode(hash);
  return computed === codeChallenge;
}

/**
 * ワンタイムコードを Redis に保存する。発行時の redirect_uri も保存し、交換時に照合する。
 * Stores one-time authorization code in Redis with userId, code_challenge, and redirect_uri for exchange-time binding.
 */
export async function storeExtensionCode(
  redis: Redis,
  code: string,
  userId: string,
  codeChallenge: string,
  redirectUri: string,
): Promise<void> {
  const key = `ext:code:${code}`;
  const value = JSON.stringify({ userId, codeChallenge, redirectUri });
  await redis.setex(key, CODE_TTL_SEC, value);
}

const CONSUME_SCRIPT = `
  local v = redis.call('GET', KEYS[1])
  if v then redis.call('DEL', KEYS[1]); return v; end
  return nil
`;

/**
 * ワンタイムコードを原子的に取得・削除する。保存されていた redirect_uri も返す。
 * Atomically retrieves and consumes (deletes) one-time code from Redis; returns stored redirect_uri for binding check.
 */
export async function consumeExtensionCode(
  redis: Redis,
  code: string,
): Promise<{ userId: string; codeChallenge: string; redirectUri: string } | null> {
  const key = `ext:code:${code}`;
  let raw: string | null = null;
  if (typeof (redis as { getdel?: (k: string) => Promise<string | null> }).getdel === "function") {
    raw = await (redis as { getdel: (k: string) => Promise<string | null> }).getdel(key);
  } else {
    const result = await redis.eval(CONSUME_SCRIPT, 1, key);
    raw = typeof result === "string" ? result : null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      userId?: string;
      codeChallenge?: string;
      redirectUri?: string;
    };
    const { userId, codeChallenge, redirectUri } = parsed;
    if (!userId || !codeChallenge || typeof redirectUri !== "string") return null;
    return { userId, codeChallenge, redirectUri };
  } catch {
    return null;
  }
}

/**
 * redirect_uri が許可されているか検証する。
 * Validates redirect_uri against allowed extension origins.
 */
export function isRedirectUriAllowed(redirectUri: string): boolean {
  const allowed = getOptionalEnv("EXTENSION_ORIGIN", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) {
    if (process.env.NODE_ENV === "production") {
      console.error("FATAL: EXTENSION_ORIGIN is not set. Refusing to allow any redirect URI.");
      return false;
    }
    // 開発時のみ *.chromiumapp.org を許容 / For development only, allow *.chromiumapp.org
    return /^https:\/\/[a-z]+\.chromiumapp\.org\/?$/i.test(redirectUri);
  }
  try {
    const parsed = new URL(redirectUri);
    const origin = parsed.origin + "/";
    return allowed.some((a) => {
      const aNorm = a.endsWith("/") ? a : a + "/";
      return origin === aNorm || redirectUri.startsWith(aNorm);
    });
  } catch {
    return false;
  }
}

/**
 * 拡張用 JWT を発行する。
 * Issues JWT for Chrome extension with clip:create scope.
 */
export async function issueExtensionToken(userId: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const secret = getEnv("BETTER_AUTH_SECRET");
  const key = new TextEncoder().encode(secret);
  const expiresIn = JWT_EXP_DAYS * 24 * 60 * 60;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;

  const jwt = await new SignJWT({ scope: [EXT_SCOPE] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience("zedi-extension")
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);

  return {
    access_token: jwt,
    expires_in: expiresIn,
  };
}

/**
 * 拡張用 JWT のペイロード形状。
 * Extension JWT token payload shape.
 *
 * @property sub - 主体（ユーザー ID）。Subject (user ID).
 * @property scope - 付与されたスコープ配列。Granted scope array (e.g. clip:create).
 * @property aud - 想定オーディエンス（例: zedi-extension）。Intended audience.
 * @property exp - 有効期限（UNIX 秒）。Expiration time (UNIX seconds).
 */
export interface ExtensionTokenPayload {
  sub: string;
  scope: string[];
  aud: string;
  exp: number;
}

/**
 * Bearer トークンを検証し、ペイロードを返す。
 * Verifies extension Bearer token and returns payload.
 */
export async function verifyExtensionToken(token: string): Promise<ExtensionTokenPayload | null> {
  try {
    const secret = getEnv("BETTER_AUTH_SECRET");
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      audience: "zedi-extension",
    });
    const sub = payload.sub;
    const scope = payload.scope as string[] | undefined;
    if (!sub || typeof sub !== "string") return null;
    if (!Array.isArray(scope) || !scope.includes(EXT_SCOPE)) return null;
    const aud = payload.aud;
    const exp = payload.exp;
    if (typeof aud !== "string") return null;
    if (typeof exp !== "number") return null;
    return {
      sub,
      scope,
      aud,
      exp,
    };
  } catch {
    return null;
  }
}
