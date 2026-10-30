/**
 * Shared helpers for the browser scripts: start `wrangler dev` on a fresh local D1,
 * sign in through the magic-link API, and launch Chromium.
 * ブラウザ系スクリプト共通: 空の D1 で `wrangler dev` を起動、マジックリンクでサインイン、Chromium 起動。
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, "../..");

/**
 * Applies the D1 migrations to a fresh persistence directory and starts `wrangler dev` on
 * `port` (serving the built `dist/client`). Resolves when the server is ready.
 * 新しい保存先に D1 マイグレーションを適用して `wrangler dev` を起動する（事前に build が必要）。
 */
export function startWorker(port) {
  const persistTo = join(root, ".wrangler/runs", `${port}-${Date.now()}`);
  mkdirSync(persistTo, { recursive: true });
  execFileSync(
    "bunx",
    ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persistTo],
    {
      cwd: root,
      stdio: "ignore",
    },
  );
  const child = spawn(
    "bunx",
    [
      "wrangler",
      "dev",
      "--port",
      String(port),
      "--ip",
      "127.0.0.1",
      "--inspector-port",
      "0",
      "--persist-to",
      persistTo,
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`wrangler dev did not start:\n${log}`));
    }, 60_000);
    const onData = (chunk) => {
      log += String(chunk);
      if (log.includes("Ready on")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`wrangler dev exited (${code}):\n${log}`)));
  });
}

/**
 * Signs in through the real magic-link endpoints (request → dev outbox → verify) and returns
 * the Cookie header value.
 * 実際のマジックリンク API でサインインし、Cookie ヘッダー値を返す。
 */
export async function signInViaApi(base, email) {
  const headers = { "content-type": "application/json", origin: base };
  const request = await fetch(`${base}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, callbackURL: "/notes" }),
  });
  if (!request.ok) throw new Error(`magic link request failed: ${request.status}`);
  const { url } = await (
    await fetch(`${base}/api/dev/outbox?email=${encodeURIComponent(email)}`)
  ).json();
  const verify = await fetch(url, { redirect: "manual" });
  const cookie = verify.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie.includes("session_token")) throw new Error("no session cookie after verify");
  return cookie;
}

/** Copies a Cookie header value into a Playwright browser context. */
export async function addSessionCookies(context, base, cookieHeader) {
  const { hostname } = new URL(base);
  await context.addCookies(
    cookieHeader.split("; ").map((pair) => {
      const index = pair.indexOf("=");
      return {
        name: pair.slice(0, index),
        value: pair.slice(index + 1),
        domain: hostname,
        path: "/",
      };
    }),
  );
}

/**
 * Launches headless Chromium. `CHROMIUM_PATH` reuses an existing browser binary when the
 * resolved Playwright version has no matching download (`npx playwright install chromium`).
 * ヘッドレス Chromium を起動する。`CHROMIUM_PATH` で既存のブラウザを使える。
 */
export function launchBrowser() {
  const { chromium } = require("playwright");
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}
