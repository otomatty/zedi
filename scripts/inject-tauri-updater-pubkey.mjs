/**
 * Injects `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` when
 * `TAURI_SIGNING_PUBLIC_KEY` is set (e.g. GitHub Actions secret for release builds).
 * Public key must match the private key used to sign updater artifacts.
 *
 * `TAURI_SIGNING_PUBLIC_KEY` が設定されているときだけ `tauri.conf.json` の
 * `plugins.updater.pubkey` を上書きする（リリース CI 用）。公開鍵は署名用秘密鍵と対になる。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");

const key = process.env.TAURI_SIGNING_PUBLIC_KEY?.trim();
// Release job / tag context: missing pubkey must fail (no unsigned release artifacts).
const isReleaseContext =
  process.env.GITHUB_ACTIONS === "true" &&
  (process.env.GITHUB_EVENT_NAME === "release" || process.env.GITHUB_REF?.startsWith("refs/tags/"));

if (!key) {
  const msg =
    "TAURI_SIGNING_PUBLIC_KEY is not set; skipping updater pubkey injection (local / unsigned builds).";
  if (isReleaseContext) {
    console.error(
      `ERROR: ${msg} In this release context (GitHub Actions release or refs/tags), set TAURI_SIGNING_PUBLIC_KEY so updater signatures can be verified.`,
    );
    process.exit(1);
  }
  console.log(msg);
  process.exit(0);
}

const raw = fs.readFileSync(configPath, "utf8");
const j = JSON.parse(raw);
j.plugins = j.plugins ?? {};
j.plugins.updater = j.plugins.updater ?? {};
j.plugins.updater.pubkey = key;
fs.writeFileSync(configPath, `${JSON.stringify(j, null, 2)}\n`);
console.log(
  "Injected TAURI_SIGNING_PUBLIC_KEY into src-tauri/tauri.conf.json (plugins.updater.pubkey).",
);
