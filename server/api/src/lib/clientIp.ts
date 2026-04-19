/**
 * クライアント IP の抽出ヘルパー / Client IP extraction helpers.
 *
 * `x-forwarded-for` と `x-real-ip` は本来クライアントが任意に送れるヘッダのため、
 * 信頼してよいかは「アプリの直前にプロキシ（Railway, Cloudflare, nginx, ...）が
 * 必ず存在し、かつそれが正しく XFF を上書きする構成か」に依存する。
 * 環境変数 `TRUST_PROXY=true` のときだけプロキシヘッダを採用し、それ以外では
 * ソケット由来の peer IP（`@hono/node-server` の conninfo）を使う。これにより、
 * 直接公開されたサーバや、信頼できないプロキシ経由のリクエストで XFF を偽装した
 * クライアントが per-IP レートリミットを回避できないようにする。
 *
 * `x-forwarded-for` and `x-real-ip` are client-controllable. We only trust them
 * when `TRUST_PROXY=true` so unauthenticated clients cannot rotate those headers
 * to bypass per-IP throttling. When the proxy is not trusted (or no proxy is
 * configured), fall back to the socket peer address.
 */
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { AppEnv } from "../types/index.js";

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
 * ソケット接続元 IP を返す。取得できなければ null。
 * Return the underlying socket peer address, or null when not available.
 */
function readSocketIp(c: Context<AppEnv>): string | null {
  try {
    const info = getConnInfo(c);
    const addr = info.remote.address?.trim();
    return addr ? addr : null;
  } catch {
    return null;
  }
}

/**
 * クライアント IP を抽出する。
 *
 * - `TRUST_PROXY=true` のとき: `x-forwarded-for` → `x-real-ip` → ソケット の順で採用。
 * - それ以外: ソケット IP のみを採用（プロキシヘッダは無視）。
 *
 * Extract the best-effort client IP. Trust proxy headers only when
 * `TRUST_PROXY=true`; otherwise rely on the socket peer address so spoofed
 * `x-forwarded-for` / `x-real-ip` values cannot influence callers.
 */
export function extractClientIp(c: Context<AppEnv>): string | null {
  if (isProxyTrusted()) {
    const fromXff = readForwardedFor(c);
    if (fromXff) return fromXff;
    const fromReal = readRealIp(c);
    if (fromReal) return fromReal;
  }
  return readSocketIp(c);
}
