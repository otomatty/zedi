#!/usr/bin/env node
/**
 * 移行で投入したデータを削除（C2-5 のロールバック）。
 * 外部キー順に DELETE。users は削除しない（ログイン済みユーザーを残す）。
 *
 * Usage: SECRET_ARN=... node scripts/migration/transform-for-aurora/rollback-migrated-data.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const CLUSTER_ARN =
  process.env.CLUSTER_ARN ||
  "arn:aws:rds:ap-northeast-1:590183877893:cluster:zedi-dev-cluster";
const SECRET_ARN =
  process.env.SECRET_ARN ||
  "arn:aws:secretsmanager:ap-northeast-1:590183877893:secret:zedi-dev-db-credentials-x1aCah";
const DATABASE = process.env.DATABASE || "zedi";

const rdsClient = new RDSDataClient({ region: REGION });

async function runStatement(sql) {
  try {
    await rdsClient.send(
      new ExecuteStatementCommand({
        resourceArn: CLUSTER_ARN,
        secretArn: SECRET_ARN,
        database: DATABASE,
        sql,
      })
    );
    return true;
  } catch (e) {
    console.error("Error:", e.message);
    return false;
  }
}

async function main() {
  console.log("Rollback: deleting migrated data (FK order). Keeping users.\n");

  const order = [
    ["page_contents", "DELETE FROM page_contents"],
    ["ghost_links", "DELETE FROM ghost_links"],
    ["links", "DELETE FROM links"],
    ["note_pages", "DELETE FROM note_pages"],
    ["note_members", "DELETE FROM note_members"],
    ["notes", "DELETE FROM notes"],
    ["pages", "DELETE FROM pages"],
  ];

  for (const [label, sql] of order) {
    process.stdout.write(`${label}... `);
    if (await runStatement(sql)) {
      console.log("OK");
    } else {
      console.log("FAILED");
      process.exit(1);
    }
  }

  console.log("\nRollback done. You can re-run the migration (C2-1 through C2-5).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
