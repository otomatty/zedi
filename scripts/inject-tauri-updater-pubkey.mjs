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
if (!key) {
  console.log(
    "TAURI_SIGNING_PUBLIC_KEY is not set; skipping updater pubkey injection (local / unsigned builds).",
  );
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
