#!/usr/bin/env node
/**
 * DB Migration Runner — tracks applied migrations in _schema_migrations.
 * Only new numbered .sql files (e.g. 007_*.sql) are applied; already-applied
 * ones are skipped.  Uses AWS CLI (no npm dependencies required).
 *
 * Usage:
 *   node migrate.mjs                     # Apply all pending migrations
 *   node migrate.mjs --dry-run           # Show what would be applied
 *   node migrate.mjs --baseline 007      # Mark 001–007 as applied (no execution)
 *   node migrate.mjs --status            # Show applied / pending migrations
 *
 * Environment:
 *   CLUSTER_ARN   Aurora cluster ARN  (required)
 *   SECRET_ARN    Secrets Manager ARN (required)
 *   DATABASE      Database name       (default: zedi)
 *   AWS_REGION    AWS region          (default: ap-northeast-1)
 */

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const CLUSTER_ARN = process.env.CLUSTER_ARN;
const SECRET_ARN = process.env.SECRET_ARN;
const DATABASE = process.env.DATABASE || "zedi";

const DRY_RUN = process.argv.includes("--dry-run");
const STATUS_ONLY = process.argv.includes("--status");
const BASELINE_IDX = process.argv.indexOf("--baseline");
const BASELINE = BASELINE_IDX !== -1 ? process.argv[BASELINE_IDX + 1] : null;

if (!CLUSTER_ARN || !SECRET_ARN) {
  console.error("Error: CLUSTER_ARN and SECRET_ARN environment variables are required.");
  console.error("  Set them directly or obtain from terraform output:");
  console.error(
    "    export CLUSTER_ARN=$(cd ../../terraform && terraform output -raw aurora_cluster_arn)",
  );
  console.error(
    "    export SECRET_ARN=$(cd ../../terraform && terraform output -raw db_credentials_secret_arn)",
  );
  process.exit(1);
}

function runSql(sql, tmpDir) {
  const tmpFile = join(tmpDir, "stmt.sql");
  writeFileSync(tmpFile, sql, "utf8");
  const escaped = tmpFile.replace(/\\/g, "/").replace(/'/g, "'\"'\"'");
  const cmd = [
    `aws rds-data execute-statement`,
    `--resource-arn "${CLUSTER_ARN}"`,
    `--secret-arn "${SECRET_ARN}"`,
    `--database "${DATABASE}"`,
    `--sql "$(cat '${escaped}')"`,
    `--region ${REGION}`,
  ].join(" ");
  try {
    const out = execSync(`bash -c '${cmd}'`, { stdio: "pipe", maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, output: out.toString() };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.message).toString().trim() };
  }
}

function querySql(sql, tmpDir) {
  const result = runSql(sql, tmpDir);
  if (!result.ok) return null;
  try {
    return JSON.parse(result.output);
  } catch {
    return null;
  }
}

function extractStatements(content) {
  const stripped = content.replace(/^\s*--[^\n]*$/gm, "").replace(/\n\s*\/\*[\s\S]*?\*\//g, "");
  return stripped
    .split(/\s*;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(";") ? s : s + ";"));
}

function getMigrationFiles() {
  return readdirSync(__dirname)
    .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f))
    .sort();
}

const tmpDir = mkdtempSync(join(tmpdir(), "zedi-migrate-"));
try {
  // Ensure tracking table
  const create = runSql(
    `CREATE TABLE IF NOT EXISTS _schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    tmpDir,
  );
  if (!create.ok) {
    console.error("Failed to create _schema_migrations table:", create.error);
    process.exit(1);
  }

  // --baseline: record files as applied without executing
  if (BASELINE) {
    const prefix = BASELINE.padStart(3, "0");
    const files = getMigrationFiles().filter((f) => f.slice(0, 3) <= prefix);
    console.log(`Baselining ${files.length} migration(s) up to ${prefix}_*:`);
    for (const file of files) {
      const safeFile = file.replace(/'/g, "''");
      const r = runSql(
        `INSERT INTO _schema_migrations (filename) VALUES ('${safeFile}') ON CONFLICT DO NOTHING;`,
        tmpDir,
      );
      console.log(`  ${file}: ${r.ok ? "recorded" : "failed"}`);
    }
    console.log("Baseline complete.");
    process.exit(0);
  }

  // Get already-applied migrations
  const applied = new Set();
  const rows = querySql("SELECT filename FROM _schema_migrations ORDER BY filename;", tmpDir);
  if (rows?.records) {
    for (const row of rows.records) applied.add(row[0].stringValue);
  }

  const allFiles = getMigrationFiles();
  const pending = allFiles.filter((f) => !applied.has(f));

  // --status: show migration status
  if (STATUS_ONLY) {
    console.log("Migration status:");
    for (const f of allFiles) {
      console.log(`  ${applied.has(f) ? "[applied]" : "[pending]"} ${f}`);
    }
    console.log(`\n${applied.size} applied, ${pending.length} pending.`);
    process.exit(0);
  }

  if (pending.length === 0) {
    console.log("All migrations already applied.");
    process.exit(0);
  }

  console.log(`${pending.length} pending migration(s):`);
  for (const f of pending) console.log(`  - ${f}`);

  if (DRY_RUN) {
    console.log("\n(dry-run — no changes applied)");
    process.exit(0);
  }

  // Apply each pending migration
  for (const file of pending) {
    console.log(`\nApplying ${file}...`);
    const content = readFileSync(join(__dirname, file), "utf8");
    const statements = extractStatements(content);
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < statements.length; i++) {
      const sql = statements[i];
      const preview = sql.slice(0, 70).replace(/\n/g, " ");
      process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}... `);
      const result = runSql(sql, tmpDir);
      if (result.ok) {
        console.log("OK");
        ok++;
      } else {
        console.log("FAILED");
        console.error(`    ${result.error.slice(0, 300)}`);
        fail++;
        break;
      }
    }

    if (fail > 0) {
      console.error(`\n${file}: ${fail} statement(s) failed. Aborting.`);
      process.exit(1);
    }

    const safeFile = file.replace(/'/g, "''");
    const recorded = runSql(
      `INSERT INTO _schema_migrations (filename) VALUES ('${safeFile}') ON CONFLICT DO NOTHING;`,
      tmpDir,
    );
    if (!recorded.ok) {
      console.error(`\n${file}: failed to record in _schema_migrations: ${recorded.error}`);
      process.exit(1);
    }
    console.log(`${file}: ${ok} statement(s) applied.`);
  }

  console.log("\nAll pending migrations applied successfully.");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
