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

/**
 * Redis key prefix for per-user MCP token revocation timestamps.
 * ユーザー単位の MCP トークン失効時刻を保存する Redis キー prefix。
 */
export const MCP_REVOKED_PREFIX = "mcp:revoked:";

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
 * MCP JWT の有効期限 (秒) を環境変数から算出する。不正・未設定時はデフォルトにフォールバック。
 * Returns MCP JWT expiration (seconds) from env, falling back to default for invalid/missing values.
 */
export function getMcpJwtExpiresInSeconds(): number {
  const expDays = Number(getOptionalEnv("MCP_JWT_EXP_DAYS", String(MCP_JWT_EXP_DAYS_DEFAULT)));
  const effectiveDays =
    Number.isFinite(expDays) && expDays > 0 ? expDays : MCP_JWT_EXP_DAYS_DEFAULT;
  return effectiveDays * 24 * 60 * 60;
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
  const expiresIn = getMcpJwtExpiresInSeconds();
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
 * 失効レコードの TTL (秒)。現在の設定値とデフォルト値の大きい方を使う。
 * `MCP_JWT_EXP_DAYS` を後から短縮しても、旧設定で発行済みの長寿命トークンが
 * Redis の失効キー消滅後に再び有効化されないよう、デフォルト (最大想定) を下限とする。
 *
 * Returns the TTL (seconds) for revocation entries: the greater of the current
 * configured JWT lifetime and the default. This prevents a later reduction of
 * `MCP_JWT_EXP_DAYS` from prematurely expiring the deny-list entry and
 * re-validating tokens issued under the previous (longer) configuration.
 */
export function getMcpRevocationTtlSeconds(): number {
  return Math.max(getMcpJwtExpiresInSeconds(), MCP_JWT_EXP_DAYS_DEFAULT * 24 * 60 * 60);
}

/**
 * 指定ユーザーの MCP トークンをすべて失効させるために、現在時刻 (UNIX 秒) を Redis に書き込む。
 * TTL は現在設定とデフォルトの大きい方とし、設定変更で失効情報が先に消えるのを防ぐ。
 * 戻り値は記録した失効時刻 (UNIX 秒)。
 *
 * Records a per-user MCP revocation timestamp (epoch seconds) in Redis with a TTL
 * that is at least as long as the maximum expected JWT lifetime, so the entry
 * cannot expire before every previously issued token does.
 * Returns the stored revocation timestamp in epoch seconds.
 */
export async function storeMcpRevocation(redis: Redis, userId: string): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  await redis.setex(`${MCP_REVOKED_PREFIX}${userId}`, getMcpRevocationTtlSeconds(), String(now));
  return now;
}

/**
 * 指定ユーザーの MCP トークン失効時刻 (UNIX 秒) を取得する。未登録または不正値なら null。
 * Returns the stored MCP revocation timestamp (epoch seconds) for a user, or null if none / malformed.
 */
export async function getMcpRevocationTimestamp(
  redis: Redis,
  userId: string,
): Promise<number | null> {
  const raw = await redis.get(`${MCP_REVOKED_PREFIX}${userId}`);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Deny-list 参照で発生した Redis 障害を JWT 検証失敗と区別するためのエラー型。
 * 呼び出し側 (ミドルウェア) はこれを捕捉し、401 ではなく 503 で応答する。
 *
 * Dedicated error type raised when the revocation deny-list lookup itself fails
 * (e.g. Redis outage). Lets callers map infrastructure errors to 503 instead of
 * silently returning 401 "invalid token" for legitimately signed tokens.
 */
export class McpRevocationLookupError extends Error {
  /**
   * 指定メッセージと `cause` で `McpRevocationLookupError` を生成する。
   * Constructs a new `McpRevocationLookupError` with an optional `cause`.
   *
   * @param message - 人間可読なエラーメッセージ / Human-readable message.
   * @param options - `cause` に元の例外を添付できる / Optional `cause` for the original error.
   */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "McpRevocationLookupError";
  }
}

/**
 * Bearer トークンを検証し、ペイロードを返す。audience と最低 1 つの MCP スコープを要求する。
 * `redis` を渡した場合は `mcp:revoked:<sub>` の失効時刻と `iat` を比較し、失効後に発行されたトークンのみ通す。
 * 比較は `iat <= revokedAt` を失効扱いとし、秒精度で同一秒に発行された境界トークンも安全側で拒否する。
 *
 * JWT 自体の検証失敗 (署名不一致・audience 相違・形式不正など) は `null` を返す。
 * 一方、deny-list の Redis 参照に失敗した場合は `McpRevocationLookupError` を投げ、
 * ミドルウェアで 503 にマップできるようにする (インフラ障害を 401 と誤認させない)。
 *
 * Verifies MCP Bearer token and returns payload; requires `zedi-mcp` audience and at least one mcp:* scope.
 * When `redis` is provided, consults the deny-list: rejects tokens whose `iat` is at or before the stored
 * revocation timestamp (inclusive, to cover boundary tokens at second-precision).
 *
 * JWT verification failures (bad signature, wrong audience, malformed payload, etc.) return `null`.
 * Deny-list lookup failures throw `McpRevocationLookupError` so callers can surface a 503 rather than
 * misclassifying an infrastructure outage as an authentication error.
 */
export async function verifyMcpToken(
  token: string,
  redis?: Redis | null,
): Promise<McpTokenPayload | null> {
  let verified: McpTokenPayload;
  let iat: number;
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
    const maybeIat = payload.iat;
    if (typeof aud !== "string") return null;
    if (typeof exp !== "number") return null;
    if (typeof maybeIat !== "number") return null;
    iat = maybeIat;
    verified = { sub, scope, aud, exp };
  } catch {
    return null;
  }

  // Deny-list lookup runs outside the JWT try/catch so Redis-side I/O errors
  // are NOT silently swallowed as "invalid token". The caller must distinguish
  // an infrastructure outage (→ 503) from an auth failure (→ 401).
  //
  // deny-list 参照は JWT 検証とは別の try で扱い、Redis 障害を誤って 401 に
  // すり替えないようにする。呼び出し側でインフラ障害 (503) と認証失敗 (401) を分離する。
  if (redis) {
    let revokedAt: number | null;
    try {
      revokedAt = await getMcpRevocationTimestamp(redis, verified.sub);
    } catch (err) {
      throw new McpRevocationLookupError("Failed to consult MCP revocation deny-list", {
        cause: err,
      });
    }
    if (revokedAt !== null && iat <= revokedAt) return null;
  }

  return verified;
}

/**
 * ペイロードが指定スコープを持つか確認する。
 * Returns true if the given payload includes the requested scope.
 */
export function hasScope(payload: McpTokenPayload, scope: string): boolean {
  return payload.scope.includes(scope);
}
