/**
 * Shared helpers for the browser scripts: start `wrangler dev` and launch Chromium.
 * ブラウザ系スクリプト共通: `wrangler dev` の起動と Chromium の起動。
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, "../..");

/**
 * Starts `wrangler dev` on `port` (serving the built `dist/client`) and resolves when ready.
 * `wrangler dev` を起動し、準備完了で resolve する（事前に `bun run build` が必要）。
 */
export function startWorker(port) {
  const child = spawn(
    "bunx",
    ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1", "--inspector-port", "0"],
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
 * Launches headless Chromium. `CHROMIUM_PATH` reuses an existing browser binary when the
 * resolved Playwright version has no matching download (`npx playwright install chromium`).
 * ヘッドレス Chromium を起動する。`CHROMIUM_PATH` で既存のブラウザを使える。
 */
export function launchBrowser() {
  const { chromium } = require("playwright");
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}
