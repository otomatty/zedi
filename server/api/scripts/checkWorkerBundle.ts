/**
 * Worker バンドル検査 CLI（#1091 LC-5、`bun run worker:bundle:check`）。
 *
 * `wrangler deploy --dry-run --outdir <tmp> --env dev` でバンドルを生成し、
 * 禁止依存（checkWorkerBundle.lib.ts の FORBIDDEN_MARKERS）の不在と gzip 後
 * サイズ（NFR-1: 10MB / Workers Paid）を検査する。資格情報不要（dry-run）の
 * ため PR CI・deploy 直前の両方で実行できる。
 *
 * Bundle guard CLI. Builds the Worker via a credential-free wrangler dry-run,
 * fails on forbidden dependencies, and reports the gzipped bundle size.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { findForbiddenMarkers } from "./checkWorkerBundle.lib.js";

/** NFR-1: Workers Paid プランの gzip 後バンドル上限。 */
const MAX_GZIP_BYTES = 10 * 1024 * 1024;

function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFilesRecursive(full) : [full];
  });
}

function main(): void {
  const outdir = mkdtempSync(join(tmpdir(), "zedi-worker-bundle-"));
  try {
    execSync(`bunx wrangler deploy --dry-run --outdir "${outdir}" --env dev`, {
      stdio: ["ignore", "inherit", "inherit"],
      cwd: join(import.meta.dirname, ".."),
    });

    const jsFiles = listFilesRecursive(outdir).filter((f) => f.endsWith(".js"));
    if (jsFiles.length === 0) {
      console.error(`[bundle-check] no .js output found in ${outdir}`);
      process.exit(1);
    }

    let totalGzip = 0;
    const violations: { file: string; markers: string[] }[] = [];
    for (const file of jsFiles) {
      const content = readFileSync(file, "utf8");
      totalGzip += gzipSync(content).byteLength;
      const markers = findForbiddenMarkers(content);
      if (markers.length > 0) violations.push({ file, markers });
    }

    const mb = (totalGzip / (1024 * 1024)).toFixed(2);
    console.log(`[bundle-check] gzip total: ${mb} MB (limit ${MAX_GZIP_BYTES / 1024 / 1024} MB)`);

    if (violations.length > 0) {
      for (const v of violations) {
        console.error(`[bundle-check] FORBIDDEN in ${v.file}: ${v.markers.join(", ")}`);
      }
      console.error(
        "[bundle-check] Worker bundle must not contain LangGraph/agents, @hono/node-server, or @sentry/node (#1091 FR-1.2 / FR-2.3).",
      );
      process.exit(1);
    }
    if (totalGzip > MAX_GZIP_BYTES) {
      console.error(
        `[bundle-check] bundle exceeds the ${MAX_GZIP_BYTES / 1024 / 1024} MB gzip limit`,
      );
      process.exit(1);
    }
    console.log("[bundle-check] OK — no forbidden dependencies in the Worker bundle");
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

main();
