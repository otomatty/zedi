#!/usr/bin/env bun
/**
 * Aurora の users テーブルにユーザーを1件挿入する（本番で upsert が動いていない場合の手動投入用）。
 *
 * Usage:
 *   PROD_AURORA_CLUSTER_ARN=... PROD_AURORA_SECRET_ARN=... \
 *   bun run scripts/sync/insert-aurora-user.ts --email "user@example.com" --cognito-sub "uuid-from-cognito" [--target prod|dev]
 * 省略時 --target は prod。DEV_AURORA_* を渡せば --target dev で開発側に挿入可能。
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const RESUME_ERROR_NAME = "DatabaseResumingException";
const RESUME_MAX_RETRIES = 4;

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function loadConfig(target: "prod" | "dev") {
  const prefix = target === "prod" ? "PROD_AURORA" : "DEV_AURORA";
  const clusterArn = process.env[`${prefix}_CLUSTER_ARN`];
  const secretArn = process.env[`${prefix}_SECRET_ARN`];
  if (!clusterArn || !secretArn) throw new Error(`Missing ${prefix}_CLUSTER_ARN or ${prefix}_SECRET_ARN`);
  return { clusterArn, secretArn, database: process.env[`${prefix}_DATABASE`] || "zedi" };
}

async function run(
  config: { clusterArn: string; secretArn: string; database: string },
  sql: string,
  params: Record<string, string>
) {
  const client = new RDSDataClient({ region: REGION });
  const parameters = Object.entries(params).map(([name, value]) => ({
    name,
    value: value == null ? { isNull: true } : { stringValue: value },
  }));

  for (let attempt = 0; attempt < RESUME_MAX_RETRIES; attempt++) {
    try {
      await client.send(
        new ExecuteStatementCommand({
          resourceArn: config.clusterArn,
          secretArn: config.secretArn,
          database: config.database,
          sql,
          parameters,
        })
      );
      return;
    } catch (err: unknown) {
      const name = err && typeof err === "object" && "name" in err ? (err as { name: string }).name : "";
      if (name !== RESUME_ERROR_NAME || attempt === RESUME_MAX_RETRIES - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function main() {
  const email = getArg("--email");
  const cognitoSub = getArg("--cognito-sub");
  const target = (getArg("--target") || "prod") as "prod" | "dev";

  if (!email || !cognitoSub) {
    console.error("Usage: --email <email> --cognito-sub <sub> [--target prod|dev]");
    process.exit(1);
  }

  const config = loadConfig(target);
  const sql = `INSERT INTO users (id, cognito_sub, email, display_name, avatar_url, created_at, updated_at)
               VALUES (gen_random_uuid(), :cognito_sub, :email, NULL, NULL, NOW(), NOW())
               ON CONFLICT (cognito_sub) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`;

  await run(config, sql, { cognito_sub: cognitoSub, email });
  console.log(`User inserted/updated in ${target} Aurora: ${email} (cognito_sub=${cognitoSub})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
