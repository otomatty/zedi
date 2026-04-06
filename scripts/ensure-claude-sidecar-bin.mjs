#!/usr/bin/env node
/**
 * Ensures `src-tauri/binaries/claude-sidecar-<host-triple>` exists; runs
 * `sidecar:build` if missing (so `tauri dev` / `cargo` can validate externalBin).
 *
 * バイナリが無ければ `sidecar:build` を実行する（`externalBin` 検証用）。
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const triple = spawnSync("rustc", ["--print", "host-tuple"], {
  encoding: "utf8",
  cwd: root,
});
if (triple.error || triple.status !== 0) {
  console.error("ensure-claude-sidecar-bin: rustc --print host-tuple failed");
  process.exit(1);
}
const hostTuple = triple.stdout.trim();
const ext = process.platform === "win32" ? ".exe" : "";
const finalPath = join(root, "src-tauri", "binaries", `claude-sidecar-${hostTuple}${ext}`);

if (existsSync(finalPath)) {
  process.exit(0);
}

console.log("Claude sidecar binary missing; running sidecar:build…");
const r = spawnSync("bun", ["run", "sidecar:build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
