#!/usr/bin/env node
/**
 * Compiles `packages/claude-sidecar` with `bun build --compile` and renames the
 * binary to `claude-sidecar-<rustc-host-tuple>[.exe]` under `src-tauri/binaries/`
 * for Tauri `bundle.externalBin`.
 *
 * `bun build --compile` でコンパイルし、Tauri `externalBin` 用に
 * `src-tauri/binaries/claude-sidecar-<triple>` にリネームする。
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = join(root, "src-tauri", "binaries");

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...options });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

const triple = spawnSync("rustc", ["--print", "host-tuple"], {
  encoding: "utf8",
  cwd: root,
});
if (triple.error || triple.status !== 0) {
  console.error("Failed to run rustc --print host-tuple");
  process.exit(1);
}

const hostTuple = triple.stdout.trim();
const ext = process.platform === "win32" ? ".exe" : "";
const finalName = `claude-sidecar-${hostTuple}${ext}`;
const tempName = `claude-sidecar-build-temp${ext}`;
const tempPath = join(outDir, tempName);
const finalPath = join(outDir, finalName);

mkdirSync(outDir, { recursive: true });

run("bun", ["build", "packages/claude-sidecar/src/index.ts", "--compile", `--outfile=${tempPath}`]);

if (existsSync(finalPath)) {
  unlinkSync(finalPath);
}
renameSync(tempPath, finalPath);
console.log(`Sidecar binary: ${finalPath}`);
