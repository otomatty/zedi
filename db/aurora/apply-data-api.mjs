#!/usr/bin/env node
/**
 * Apply Aurora DDL via AWS RDS Data API (no psql or VPC access required).
 * Requires: AWS CLI configured, Aurora cluster with Data API enabled.
 *
 * Usage:
 *   node apply-data-api.mjs
 *   SECRET_ARN=... CLUSTER_ARN=... node apply-data-api.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = process.env.SCHEMA_FILE || "001_schema.sql";
const SCHEMA_PATH = join(__dirname, SCHEMA_FILE);

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const CLUSTER_ARN =
  process.env.CLUSTER_ARN ||
  "arn:aws:rds:ap-northeast-1:590183877893:cluster:zedi-dev-cluster";
const SECRET_ARN =
  process.env.SECRET_ARN ||
  "arn:aws:secretsmanager:ap-northeast-1:590183877893:secret:zedi-dev-db-credentials-x1aCah";
const DATABASE = process.env.DATABASE || "zedi";

function extractStatements(content) {
  const stripped = content
    .replace(/^\s*--[^\n]*$/gm, "")
    .replace(/\n\s*\/\*[\s\S]*?\*\//g, "");
  const parts = stripped.split(/\s*;\s*\n/).map((s) => s.trim());
  return parts.filter((s) => s.length > 0).map((s) => (s.endsWith(";") ? s : s + ";"));
}

function runStatement(sql, tmpDir) {
  const tmpFile = join(tmpDir, "stmt.sql");
  writeFileSync(tmpFile, sql, "utf8");
  const filePathForBash = tmpFile.replace(/\\/g, "/").replace(/'/g, "'\"'\"'");
  const cmd = `bash -c 'aws rds-data execute-statement --resource-arn "${CLUSTER_ARN}" --secret-arn "${SECRET_ARN}" --database "${DATABASE}" --sql "$(cat "${filePathForBash}")" --region ${REGION}'`;
  try {
    execSync(cmd, { stdio: "pipe", maxBuffer: 2 * 1024 * 1024 });
    return true;
  } catch (e) {
    if (e.stderr) process.stderr.write(e.stderr);
    return false;
  }
}

const content = readFileSync(SCHEMA_PATH, "utf8");
const statements = extractStatements(content);
const tmpDir = mkdtempSync(join(tmpdir(), "zedi-aurora-"));
try {
  console.log(`Found ${statements.length} statements. Applying...`);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const preview = sql.slice(0, 60).replace(/\n/g, " ");
    process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}... `);
    if (runStatement(sql, tmpDir)) {
      console.log("OK");
      ok++;
    } else {
      console.log("FAILED");
      fail++;
    }
  }

  console.log(`\nDone: ${ok} OK, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
