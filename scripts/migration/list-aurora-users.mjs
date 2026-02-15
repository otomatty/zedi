#!/usr/bin/env node
/**
 * List all users in dev Aurora (users テーブル).
 * RDS Data API を使用。CLUSTER_ARN / SECRET_ARN は環境変数または既定値。
 *
 * Usage:
 *   node scripts/migration/list-aurora-users.mjs
 *   SECRET_ARN=arn:aws:secretsmanager:... node scripts/migration/list-aurora-users.mjs
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

function fromRecord(record) {
  return record.map((col) => {
    if (col.stringValue !== undefined) return col.stringValue;
    if (col.longValue !== undefined) return String(col.longValue);
    if (col.isNull) return null;
    return null;
  });
}

async function main() {
  const sql = `SELECT id, cognito_sub, email, display_name, created_at, updated_at FROM users ORDER BY created_at`;
  let response;
  try {
    response = await rdsClient.send(
      new ExecuteStatementCommand({
        resourceArn: CLUSTER_ARN,
        secretArn: SECRET_ARN,
        database: DATABASE,
        sql,
      })
    );
  } catch (e) {
    console.error("Failed to query Aurora:", e.message);
    if (e.message?.includes("Secret") || e.message?.includes("ResourceNotFoundException")) {
      console.error("Set SECRET_ARN to current value: terraform -chdir=terraform output -raw db_credentials_secret_arn");
    }
    process.exit(1);
  }

  const columnLabels = ["id", "cognito_sub", "email", "display_name", "created_at", "updated_at"];
  const records = response.records ?? [];
  const rows = records.map((rec) => fromRecord(rec));

  console.log("\n--- Aurora (dev) users テーブル ---\n");
  if (rows.length === 0) {
    console.log("No users in Aurora (table may be empty or not yet migrated).\n");
    return;
  }

  console.log(
    "id (UUID)                            | cognito_sub (max 40)        | email                      | display_name | created_at"
  );
  console.log(
    "-------------------------------------+-----------------------------+----------------------------+--------------+---------------------------"
  );
  for (const row of rows) {
    const [id, cognito_sub, email, display_name, created_at] = row;
    const idStr = (id ?? "").padEnd(36);
    const subStr = (cognito_sub ?? "").slice(0, 36).padEnd(36);
    const emailStr = (email ?? "").slice(0, 40).padEnd(40);
    const nameStr = (display_name ?? "").slice(0, 16).padEnd(16);
    const createdAtStr = (created_at ?? "").slice(0, 27);
    console.log(`${idStr} | ${subStr} | ${emailStr} | ${nameStr} | ${createdAtStr}`);
  }
  console.log(`\nTotal: ${rows.length} user(s)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
