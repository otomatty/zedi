/**
 * MCP (Model Context Protocol) 認証ライブラリ
 *
 * - ワンタイムコードの Redis 保存・原子的取得
 * - PKCE 検証
 * - JWT 発行・検証 (scope: mcp:read / mcp:write, audience: zedi-mcp)
 *
 * 既存の拡張用認証 (`extAuth.ts`) と並行した独立系統として提供する。
 * `BETTER_AUTH_SECRET` は共有するが、`audience` と Redis key prefix で blast radius を分離する。
 *
 * MCP auth library: PKCE, one-time code storage, JWT issuance/verification.
 * Shares `BETTER_AUTH_SECRET` with extension auth but isolates audience and Redis namespace.
 */
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Redis } from "ioredis";
import { getEnv, getOptionalEnv } from "./env.js";

// ── Constants / 定数 ────────────────────────────────────────────────────────

/** ワンタイムコードの TTL (秒) / One-time code TTL in seconds (5 minutes). */
export const MCP_CODE_TTL_SEC = 300;

/** JWT 有効期限のデフォルト日数 / Default JWT expiration in days. */
export const MCP_JWT_EXP_DAYS_DEFAULT = 30;

/** JWT audience: 既存の `zedi-extension` と分離 / Audience distinct from extension tokens. */
export const MCP_JWT_AUDIENCE = "zedi-mcp";

/** 読み取り系操作用スコープ / Scope for read-only MCP tools. */
export const MCP_SCOPE_READ = "mcp:read";

/** 書き込み系操作用スコープ / Scope for write MCP tools. */
export const MCP_SCOPE_WRITE = "mcp:write";

/** Redis key prefix (extAuth の `ext:code:` と分離) / Redis namespace distinct from ext codes. */
const REDIS_CODE_PREFIX = "mcp:code:";

// ── PKCE ────────────────────────────────────────────────────────────────────

/** base64url encode (no padding). */
function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * PKCE: 与えられた code_verifier から code_challenge を計算し期待値と一致するか検証する。
 * Verifies PKCE: SHA256(code_verifier) base64url === expected code_challenge.
 *
 * @param codeVerifier - クライアントが保持していた verifier 文字列。
 * @param codeChallenge - サーバーが保存していた challenge 文字列。
 * @returns 一致すれば true、それ以外 (空入力含む) は false。
 */
export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  const hash = createHash("sha256").update(codeVerifier).digest();
  const computed = base64urlEncode(hash);
  return computed === codeChallenge;
}

// ── One-time code storage (Redis) ───────────────────────────────────────────

/**
 * MCP 用ワンタイムコードを Redis に保存する。発行時の `redirect_uri` を保存し、交換時に照合する。
 * Stores MCP one-time code in Redis with userId, code_challenge, redirect_uri for exchange-time binding.
 */
export async function storeMcpCode(
  redis: Redis,
  code: string,
  userId: string,
  codeChallenge: string,
  redirectUri: string,
): Promise<void> {
  const key = `${REDIS_CODE_PREFIX}${code}`;
  const value = JSON.stringify({ userId, codeChallenge, redirectUri });
  await redis.setex(key, MCP_CODE_TTL_SEC, value);
}

const CONSUME_SCRIPT = `
  local v = redis.call('GET', KEYS[1])
  if v then redis.call('DEL', KEYS[1]); return v; end
  return nil
`;

/**
 * MCP 用ワンタイムコードを原子的に取得・削除する。保存されていた `redirect_uri` も返す。
 * Atomically retrieves and consumes (deletes) MCP one-time code from Redis.
 */
export async function consumeMcpCode(
  redis: Redis,
  code: string,
): Promise<{ userId: string; codeChallenge: string; redirectUri: string } | null> {
  const key = `${REDIS_CODE_PREFIX}${code}`;
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

// ── redirect_uri allowlist ──────────────────────────────────────────────────

/**
 * `redirect_uri` が許可リストに含まれるか検証する。
 * `MCP_REDIRECT_URI_ALLOW` をカンマ区切りで参照し、各エントリの origin (末尾 `/` 付き) 一致か
 * 先頭一致でチェックする。末尾がポート `:` (例: `http://127.0.0.1:`) で終わる場合は任意ポートを許可する。
 *
 * Validates `redirect_uri` against the `MCP_REDIRECT_URI_ALLOW` allowlist.
 * Allows exact origin match or prefix match. A trailing `:` (e.g. `http://127.0.0.1:`) matches any port.
 */
export function isMcpRedirectUriAllowed(redirectUri: string): boolean {
  const allowed = getOptionalEnv("MCP_REDIRECT_URI_ALLOW", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) {
    console.error("FATAL: MCP_REDIRECT_URI_ALLOW is not set. Refusing to allow any redirect URI.");
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return false;
  }
  const origin = parsed.origin + "/";
  return allowed.some((a) => {
    // Wildcard port form: "http://127.0.0.1:" — match any port on that host.
    // 任意ポート形式: host の末尾が `:` のエントリは、任意ポートを許可する。
    if (a.endsWith(":")) {
      const base = a.slice(0, -1); // "http://127.0.0.1"
      return parsed.origin.startsWith(base + ":") || parsed.origin === base;
    }
    const aNorm = a.endsWith("/") ? a : a + "/";
    return origin === aNorm || redirectUri.startsWith(aNorm);
  });
}

// ── JWT issue / verify ──────────────────────────────────────────────────────

/**
 * MCP 用 JWT のペイロード形状。
 * MCP JWT token payload shape.
 *
 * - `sub`: 主体 (ユーザー ID)。Subject (user ID).
 * - `scope`: 付与されたスコープ配列。Granted scope array (mcp:read / mcp:write).
 * - `aud`: 想定オーディエンス (`zedi-mcp`)。Intended audience.
 * - `exp`: 有効期限 (UNIX 秒)。Expiration time (UNIX seconds).
 */
export interface McpTokenPayload {
  /** Subject (user ID). 主体 (ユーザー ID)。 */
  sub: string;
  /** Granted scope array (mcp:read / mcp:write). 付与されたスコープ配列。 */
  scope: string[];
  /** Intended audience (`zedi-mcp`). 想定オーディエンス。 */
  aud: string;
  /** Expiration time (UNIX seconds). 有効期限 (UNIX 秒)。 */
  exp: number;
}

/**
 * MCP 用 JWT を発行する。
 * Issues JWT for MCP server with requested scopes.
 *
 * @param userId - 主体となるユーザー ID。
 * @param scopes - 付与するスコープ配列 (例: `[mcp:read, mcp:write]`)。
 * @returns `{ access_token, expires_in }`
 */
export async function issueMcpToken(
  userId: string,
  scopes: string[],
): Promise<{ access_token: string; expires_in: number }> {
  const secret = getEnv("BETTER_AUTH_SECRET");
  const key = new TextEncoder().encode(secret);
  const expDays = Number(getOptionalEnv("MCP_JWT_EXP_DAYS", String(MCP_JWT_EXP_DAYS_DEFAULT)));
  const expiresIn =
    (Number.isFinite(expDays) && expDays > 0 ? expDays : MCP_JWT_EXP_DAYS_DEFAULT) * 24 * 60 * 60;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;

  const jwt = await new SignJWT({ scope: scopes })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(MCP_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);

  return { access_token: jwt, expires_in: expiresIn };
}

/**
 * Bearer トークンを検証し、ペイロードを返す。audience と最低 1 つの MCP スコープを要求する。
 * Verifies MCP Bearer token and returns payload; requires `zedi-mcp` audience and at least one mcp:* scope.
 */
export async function verifyMcpToken(token: string): Promise<McpTokenPayload | null> {
  try {
    const secret = getEnv("BETTER_AUTH_SECRET");
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      audience: MCP_JWT_AUDIENCE,
    });
    const sub = payload.sub;
    const scope = payload.scope as string[] | undefined;
    if (!sub || typeof sub !== "string") return null;
    if (!Array.isArray(scope)) return null;
    const hasAnyMcpScope = scope.some((s) => s === MCP_SCOPE_READ || s === MCP_SCOPE_WRITE);
    if (!hasAnyMcpScope) return null;
    const aud = payload.aud;
    const exp = payload.exp;
    if (typeof aud !== "string") return null;
    if (typeof exp !== "number") return null;
    return { sub, scope, aud, exp };
  } catch {
    return null;
  }
}

/**
 * ペイロードが指定スコープを持つか確認する。
 * Returns true if the given payload includes the requested scope.
 */
export function hasScope(payload: McpTokenPayload, scope: string): boolean {
  return payload.scope.includes(scope);
}
