/**
 * Bulk-upload secrets from `.env.worker.<env>` via `wrangler secret put`.
 *
 * Usage:
 *   bun run worker:secrets:put -- --env dev
 *   bun run worker:secrets:put -- --env production
 *   bun run worker:secrets:put -- --env dev --dry-run
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkerEnvFile } from "./parseWorkerEnvFile.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(SCRIPT_DIR, "..");

type WranglerEnv = "dev" | "production";

function usage(): never {
  console.error(
    "Usage: bun scripts/putWorkerSecrets.ts --env <dev|production> [--file <path>] [--dry-run]",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): {
  env: WranglerEnv;
  file?: string;
  dryRun: boolean;
} {
  let env: WranglerEnv | undefined;
  let file: string | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") {
      const value = argv[++i];
      if (value !== "dev" && value !== "production") usage();
      env = value;
      continue;
    }
    if (arg === "--file") {
      file = argv[++i];
      if (!file) usage();
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") usage();
    usage();
  }

  if (!env) usage();
  return { env, file, dryRun };
}

function putSecret(name: string, value: string, env: WranglerEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("bunx", ["wrangler", "secret", "put", name, "--env", env], {
      cwd: API_ROOT,
      stdio: ["pipe", "inherit", "inherit"],
      shell: true,
    });
    child.stdin.write(value);
    child.stdin.end();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`wrangler secret put ${name} failed (exit ${code})`));
    });
  });
}

async function main(): Promise<void> {
  const { env, file, dryRun } = parseArgs(process.argv.slice(2));
  const envPath = resolve(API_ROOT, file ?? `.env.worker.${env}`);
  const text = readFileSync(envPath, "utf8");
  const entries = parseWorkerEnvFile(text);

  if (entries.length === 0) {
    console.error(`No secrets found in ${envPath}`);
    process.exit(1);
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Putting ${entries.length} secret(s) from ${envPath} → --env ${env}`,
  );
  for (const { name, value } of entries) {
    if (dryRun) {
      console.log(`  ${name} (${value.length} chars)`);
      continue;
    }
    console.log(`  ${name}...`);
    await putSecret(name, value, env);
  }
  console.log(dryRun ? "Dry run complete." : "Done.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
