/**
 * Node 専用のソケット IP resolver 配線。`@hono/node-server/conninfo` への
 * 静的 import はこのモジュールだけが持ち、`index.ts` だけが import する。
 * worker.ts が import すると `worker:bundle:check` が fail する（#1091 FR-2.3）。
 *
 * Node-only socket resolver wiring. This is the single module allowed to
 * import `@hono/node-server/conninfo`; only the Node entry imports it.
 */
import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { AppEnv } from "../types/index.js";
import { setSocketIpResolver } from "./clientIp.js";

/**
 * ソケット接続元 IP を返す。取得できなければ null。
 * Return the underlying socket peer address, or null when not available.
 */
function readNodeSocketIp(c: Context<AppEnv>): string | null {
  try {
    const info = getConnInfo(c);
    const addr = info.remote.address?.trim();
    return addr ? addr : null;
  } catch {
    return null;
  }
}

/**
 * Node エントリ起動時に呼び、ソケットフォールバックを有効化する。
 * Install the Node socket fallback into the runtime-neutral clientIp module.
 */
export function installNodeSocketIpResolver(): void {
  setSocketIpResolver(readNodeSocketIp);
}
