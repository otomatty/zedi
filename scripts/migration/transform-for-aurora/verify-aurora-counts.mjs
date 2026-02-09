#!/usr/bin/env node
/**
 * C2-7: 整合性検証（件数比較）
 * aurora-transform-*.json と page-contents-with-text-*.json の件数を「期待値」とし、
 * Aurora（RDS Data API）の各テーブルの COUNT と比較する。
 *
 * 実行: node scripts/migration/transform-for-aurora/verify-aurora-counts.mjs [--transform path] [--page-contents path]
 * 入力省略時は output/ 内の最新ファイルを使用。
 */

import { readFile, readdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, "output");

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const CLUSTER_ARN =
  process.env.CLUSTER_ARN ||
  "arn:aws:rds:ap-northeast-1:590183877893:cluster:zedi-dev-cluster";
const SECRET_ARN =
  process.env.SECRET_ARN ||
  "arn:aws:secretsmanager:ap-northeast-1:590183877893:secret:zedi-dev-db-credentials-x1aCah";
const DATABASE = process.env.DATABASE || "zedi";

const rdsClient = new RDSDataClient({ region: REGION });

const TABLES = [
  "users",
  "pages",
  "notes",
  "note_pages",
  "note_members",
  "links",
  "ghost_links",
  "page_contents",
];

async function getAuroraCount(table) {
  const sql = `SELECT COUNT(*) AS cnt FROM ${table}`;
  const response = await rdsClient.send(
    new ExecuteStatementCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      database: DATABASE,
      sql,
    })
  );
  const records = response.records ?? [];
  if (records.length === 0) return null;
  const firstField = records[0][0];
  if (firstField?.longValue !== undefined) return Number(firstField.longValue);
  return null;
}

async function findLatest(pattern) {
  let files = [];
  try {
    files = await readdir(outputDir);
  } catch (_) {
    return null;
  }
  const matched = files
    .filter((f) => f.startsWith(pattern) && f.endsWith(".json"))
    .sort()
    .reverse();
  return matched.length ? join(outputDir, matched[0]) : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const transformPath = argv
    .find((a) => a.startsWith("--transform="))
    ?.slice("--transform=".length);
  const pageContentsPath = argv
    .find((a) => a.startsWith("--page-contents="))
    ?.slice("--page-contents=".length);

  const transformFile = transformPath || (await findLatest("aurora-transform-"));
  const pageContentsFile =
    pageContentsPath || (await findLatest("page-contents-with-text-"));

  if (!transformFile) {
    console.error("aurora-transform-*.json not found. Run C2-2 first.");
    process.exit(1);
  }
  if (!pageContentsFile) {
    console.error("page-contents-with-text-*.json not found. Run C2-4 first.");
    process.exit(1);
  }

  const transformData = JSON.parse(await readFile(transformFile, "utf8"));
  const pageContentsData = JSON.parse(
    await readFile(pageContentsFile, "utf8")
  );

  const expected = {
    users: (transformData.users ?? []).length,
    pages: (transformData.pages ?? []).length,
    notes: (transformData.notes ?? []).length,
    note_pages: (transformData.note_pages ?? []).length,
    note_members: (transformData.note_members ?? []).length,
    links: (transformData.links ?? []).length,
    ghost_links: (transformData.ghost_links ?? []).length,
    page_contents: (pageContentsData.page_contents ?? []).length,
  };

  console.log("Expected (from transform + page-contents JSON):");
  TABLES.forEach((t) => console.log(`  ${t}: ${expected[t]}`));
  console.log("");

  console.log("Aurora (RDS Data API COUNT):");
  let allOk = true;
  for (const table of TABLES) {
    let count;
    try {
      count = await getAuroraCount(table);
    } catch (e) {
      console.error(`  ${table}: ERROR ${e.message ?? e}`);
      allOk = false;
      continue;
    }
    const exp = expected[table];
    const ok = count === exp;
    if (!ok) allOk = false;
    const status = ok ? "OK" : "MISMATCH";
    console.log(`  ${table}: ${count} (expected ${exp}) [${status}]`);
  }

  console.log("");
  if (allOk) {
    console.log("Result: All counts match.");
    process.exit(0);
  } else {
    console.log("Result: One or more counts differ.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
