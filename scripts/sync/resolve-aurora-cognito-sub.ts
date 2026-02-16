#!/usr/bin/env bun
/**
 * 設定ファイルの email から、本番・開発 Aurora の users を検索し cognito_sub を表示する。
 * dev-user-mapping-aurora.json に productionCognitoSub / developmentCognitoSub を書き写す際に使用。
 *
 * 前提: PROD_AURORA_CLUSTER_ARN, PROD_AURORA_SECRET_ARN, DEV_AURORA_CLUSTER_ARN, DEV_AURORA_SECRET_ARN を設定
 *
 * Usage:
 *   bun run scripts/sync/resolve-aurora-cognito-sub.ts [--config path]
 */

import { RDSDataClient, ExecuteStatementCommand, type Field, type SqlParameter } from "@aws-sdk/client-rds-data";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const RESUME_ERROR_NAME = "DatabaseResumingException";
const RESUME_MAX_RETRIES = 4;

interface AuroraConfig {
  clusterArn: string;
  secretArn: string;
  database: string;
}

function toParamValue(v: unknown): Field {
  if (v === null || v === undefined) return { isNull: true };
  if (typeof v === "string") return { stringValue: v };
  return { stringValue: String(v) };
}

function buildParams(params: Record<string, unknown>): SqlParameter[] {
  return Object.entries(params).map(([name, value]) => ({
    name,
    value: toParamValue(value),
  }));
}

function createConnection(config: AuroraConfig) {
  const client = new RDSDataClient({ region: REGION });
  async function query(sql: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    for (let attempt = 0; attempt < RESUME_MAX_RETRIES; attempt++) {
      try {
        const cmd = new ExecuteStatementCommand({
          resourceArn: config.clusterArn,
          secretArn: config.secretArn,
          database: config.database,
          sql,
          parameters: Object.keys(params).length ? buildParams(params) : undefined,
          formatRecordsAs: "JSON",
        });
        const res = await client.send(cmd);
        if (!res.formattedRecords) return [];
        return JSON.parse(res.formattedRecords) as Record<string, unknown>[];
      } catch (err: unknown) {
        const name = err && typeof err === "object" && "name" in err ? (err as { name: string }).name : "";
        if (name !== RESUME_ERROR_NAME || attempt === RESUME_MAX_RETRIES - 1) throw err;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    return [];
  }
  return { query };
}

function loadAuroraConfig(role: "prod" | "dev"): AuroraConfig {
  const prefix = role === "prod" ? "PROD_AURORA" : "DEV_AURORA";
  const clusterArn = process.env[`${prefix}_CLUSTER_ARN`];
  const secretArn = process.env[`${prefix}_SECRET_ARN`];
  if (!clusterArn || !secretArn) {
    throw new Error(`Missing ${prefix}_CLUSTER_ARN or ${prefix}_SECRET_ARN`);
  }
  return {
    clusterArn,
    secretArn,
    database: process.env[`${prefix}_DATABASE`] || "zedi",
  };
}

interface DeveloperEntry {
  email: string;
  productionCognitoSub?: string;
  developmentCognitoSub?: string;
  description?: string;
}

async function main() {
  const configPath = process.argv.includes("--config")
    ? process.argv[process.argv.indexOf("--config") + 1]
    : resolve(__dirname, "dev-user-mapping-aurora.json");

  if (!existsSync(configPath)) {
    console.error("❌ Config not found:", configPath);
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8")) as { developers: DeveloperEntry[] };
  const emails = [...new Set((config.developers || []).map((d) => d.email).filter(Boolean))];
  if (emails.length === 0) {
    console.error("❌ No emails in config.developers");
    process.exit(1);
  }

  const prodConfig = loadAuroraConfig("prod");
  const devConfig = loadAuroraConfig("dev");
  const prodConn = createConnection(prodConfig);
  const devConn = createConnection(devConfig);

  console.log("\n📋 cognito_sub by email (prod / dev)\n");

  for (const email of emails) {
    let prodRow: Record<string, unknown> | undefined;
    let devRow: Record<string, unknown> | undefined;
    let prodError: string | null = null;
    let devError: string | null = null;

    try {
      [prodRow] = await prodConn.query(
        "SELECT id, cognito_sub, email FROM users WHERE email = :email LIMIT 1",
        { email }
      );
    } catch (e) {
      prodError = e instanceof Error ? e.message : String(e);
    }
    try {
      [devRow] = await devConn.query(
        "SELECT id, cognito_sub, email FROM users WHERE email = :email LIMIT 1",
        { email }
      );
    } catch (e) {
      devError = e instanceof Error ? e.message : String(e);
    }

    const prodSub = prodRow ? (prodRow.cognito_sub as string) : null;
    const devSub = devRow ? (devRow.cognito_sub as string) : null;

    console.log(`Email: ${email}`);
    console.log(`  productionCognitoSub:  ${prodSub ?? (prodError ? `(error: ${prodError})` : "(not found in prod)")}`);
    console.log(`  developmentCognitoSub: ${devSub ?? (devError ? `(error: ${devError})` : "(not found in dev)")}`);
    console.log("");
  }

  console.log("上記の値を dev-user-mapping-aurora.json の各 developer の productionCognitoSub / developmentCognitoSub にコピーしてください。\n");
}

main().catch((err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
