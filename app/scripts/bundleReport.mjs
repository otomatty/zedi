#!/usr/bin/env node
/**
 * Builds the client and reports raw / gzip / brotli sizes, split into the initial load
 * (assets referenced by index.html) and lazily loaded chunks.
 * クライアントをビルドし、初期ロード分と遅延チャンクのサイズ（raw / gzip / brotli）を出す。
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist/client");
execSync("bunx vite build", { cwd: root, stdio: "ignore" });

const html = readFileSync(join(dist, "index.html"), "utf8");
const initial = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1]));
const sizeOf = (buf) => ({
  raw: buf.length,
  gzip: gzipSync(buf, { level: 9 }).length,
  brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});

const assets = readdirSync(join(dist, "assets")).map((file) => {
  const path = `assets/${file}`;
  return { path, initial: initial.has(path), ...sizeOf(readFileSync(join(dist, path))) };
});
const sum = (list, key) => list.reduce((acc, a) => acc + a[key], 0);
const initialJs = assets.filter((a) => a.initial && a.path.endsWith(".js"));
const report = {
  assets,
  initialJs: {
    raw: sum(initialJs, "raw"),
    gzip: sum(initialJs, "gzip"),
    brotli: sum(initialJs, "brotli"),
  },
};

mkdirSync(join(root, "results"), { recursive: true });
writeFileSync(join(root, "results/bundle.json"), `${JSON.stringify(report, null, 2)}\n`);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log("| asset | load | raw | gzip | brotli |\n|---|---|---|---|---|");
for (const a of assets.sort((x, y) => Number(y.initial) - Number(x.initial) || y.raw - x.raw)) {
  console.log(
    `| ${a.path} | ${a.initial ? "initial" : "lazy"} | ${kb(a.raw)} | ${kb(a.gzip)} | ${kb(a.brotli)} |`,
  );
}
console.log(
  `\nInitial JS: ${kb(report.initialJs.raw)} raw / ${kb(report.initialJs.gzip)} gzip / ${kb(report.initialJs.brotli)} brotli`,
);
