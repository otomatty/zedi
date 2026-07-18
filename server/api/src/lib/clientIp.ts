/**
 * クライアント IP の抽出ヘルパー / Client IP extraction helpers.
 *
 * `x-forwarded-for` と `x-real-ip` は本来クライアントが任意に送れるヘッダのため、
 * 信頼してよいかは「アプリの直前にプロキシ（Railway, Cloudflare, nginx, ...）が
 * 必ず存在し、かつそれが正しく XFF を上書きする構成か」に依存する。
 * 環境変数 `TRUST_PROXY=true` のときだけプロキシヘッダを採用し、それ以外では
 * ソケット由来の peer IP を使う。これにより、直接公開されたサーバや、信頼できない
 * プロキシ経由のリクエストで XFF を偽装したクライアントが per-IP レートリミットを
 * 回避できないようにする。
 *
 * Workers ランタイム（`RUNTIME=cloudflare-workers` — wrangler.jsonc の vars で
 * 明示宣言）では、Cloudflare がエッジで必ず上書きする `CF-Connecting-IP` を
 * 第一候補にする。ヘッダの存在ではなく RUNTIME シグナルでゲートするのは、
 * Node/Railway 経路で攻撃者が同名ヘッダを自称する偽装を排除するため（#1091 SR-5）。
 *
 * ソケットフォールバックは Node 専用（`@hono/node-server`）のため、このモジュール
 * には静的 import せず、`clientIpNode.ts` が resolver を注入する（Worker バンドル
 * から `@hono/node-server` を除外する — #1091 FR-2.3）。
 *
 * `x-forwarded-for` and `x-real-ip` are client-controllable. We only trust them
 * when `TRUST_PROXY=true`. On the Workers runtime (explicit `RUNTIME` var, never
 * header sniffing) `CF-Connecting-IP` wins. The Node-only socket fallback is
 * injected by `clientIpNode.ts` so the Worker bundle never pulls in
 * `@hono/node-server`.
 */
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";

/**
 * ソケット接続元 IP の resolver。Node エントリだけが `clientIpNode.ts` 経由で
 * 注入する。未注入（= Workers）ではソケットフォールバックは常に null。
 */
export type SocketIpResolver = (c: Context<AppEnv>) => string | null;

let socketIpResolver: SocketIpResolver | null = null;

/**
 * ソケット IP resolver を注入する（null でリセット）。
 * Inject the Node-only socket peer resolver (pass null to reset).
 */
export function setSocketIpResolver(resolver: SocketIpResolver | null): void {
  socketIpResolver = resolver;
}

/**
 * `TRUST_PROXY` 環境変数が真と評価されるかを返す。
 * `"true" | "1" | "yes"` を真として扱い、それ以外は偽。
 *
 * Returns whether `TRUST_PROXY` env should enable proxy-header trust.
 * Recognises `"true" | "1" | "yes"` as truthy.
 */
export function isProxyTrusted(): boolean {
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * Workers ランタイムか。`c.env.RUNTIME`（wrangler.jsonc vars）で判定する。
 * ヘッダ存在による判定は偽装可能なため行わない（#1091 SR-5）。
 *
 * Whether we are on the Workers runtime, decided by the explicit `RUNTIME`
 * binding var — never by header presence, which clients can spoof.
 */
function isWorkersRuntime(c: Context<AppEnv>): boolean {
  const env = c.env as Record<string, unknown> | undefined;
  return env?.RUNTIME === "cloudflare-workers";
}

/**
 * `x-forwarded-for` の最左の非空 IP を返す。先頭にカンマが並ぶ不正値も許容する。
 * Return the leftmost non-empty IP from `x-forwarded-for`; tolerates
 * malformed leading commas (e.g. `", 203.0.113.1"`).
 */
function readForwardedFor(c: Context<AppEnv>): string | null {
  const xff = c.req.header("x-forwarded-for");
  if (!xff) return null;
  const first = xff
    .split(",")
    .map((v) => v.trim())
    .find((v) => v.length > 0);
  return first ?? null;
}

/**
 * `x-real-ip` を返す。空の場合は null。
 * Return the trimmed `x-real-ip` value, or null when absent/empty.
 */
function readRealIp(c: Context<AppEnv>): string | null {
  const real = c.req.header("x-real-ip")?.trim();
  return real ? real : null;
}

/**
 * 注入済み resolver 経由でソケット接続元 IP を返す。未注入なら null。
 * Return the socket peer address via the injected resolver, or null.
 */
function readSocketIp(c: Context<AppEnv>): string | null {
  if (!socketIpResolver) return null;
  try {
    return socketIpResolver(c);
  } catch {
    return null;
  }
}

/**
 * クライアント IP を抽出する。
 *
 * - Workers ランタイム: `CF-Connecting-IP` を第一候補に採用。
 * - `TRUST_PROXY=true` のとき: `x-forwarded-for` → `x-real-ip` → ソケット の順で採用。
 * - それ以外: ソケット IP のみを採用（プロキシヘッダは無視）。
 *
 * Extract the best-effort client IP. On Workers, `CF-Connecting-IP` (set by
 * Cloudflare at the edge) wins. Otherwise trust proxy headers only when
 * `TRUST_PROXY=true`, falling back to the injected socket resolver.
 */
export function extractClientIp(c: Context<AppEnv>): string | null {
  if (isWorkersRuntime(c)) {
    const cfIp = c.req.header("cf-connecting-ip")?.trim();
    if (cfIp) return cfIp;
  }
  if (isProxyTrusted()) {
    const fromXff = readForwardedFor(c);
    if (fromXff) return fromXff;
    const fromReal = readRealIp(c);
    if (fromReal) return fromReal;
  }
  return readSocketIp(c);
}
