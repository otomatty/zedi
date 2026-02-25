/**
 * Drizzle ORM DB クライアント (RDS Data API)
 *
 * Aurora Serverless v2 に RDS Data API 経由でアクセスする型安全な DB クライアント。
 * Lambda 環境変数:
 *   - AURORA_CLUSTER_ARN
 *   - DB_CREDENTIALS_SECRET
 *   - AURORA_DATABASE_NAME (default: "zedi")
 */
import { drizzle, type AwsDataApiPgDatabase } from "drizzle-orm/aws-data-api/pg";
import { RDSDataClient } from "@aws-sdk/client-rds-data";
import * as schema from "../schema";

export interface DbEnv {
  AURORA_CLUSTER_ARN: string;
  DB_CREDENTIALS_SECRET: string;
  AURORA_DATABASE_NAME?: string;
}

/**
 * 環境変数から DB クライアントを生成する
 */
export function createDb(env: DbEnv): AwsDataApiPgDatabase<typeof schema> {
  return drizzle(new RDSDataClient({}), {
    database: env.AURORA_DATABASE_NAME ?? "zedi",
    resourceArn: env.AURORA_CLUSTER_ARN,
    secretArn: env.DB_CREDENTIALS_SECRET,
    schema,
  });
}

/**
 * Lambda 環境変数から自動的に DB クライアントを生成する (シングルトン)
 */
let _db: AwsDataApiPgDatabase<typeof schema> | null = null;

export function getDb(): AwsDataApiPgDatabase<typeof schema> {
  if (_db) return _db;

  const clusterArn = process.env.AURORA_CLUSTER_ARN;
  const secretArn = process.env.DB_CREDENTIALS_SECRET;
  if (!clusterArn || !secretArn) {
    throw new Error("AURORA_CLUSTER_ARN and DB_CREDENTIALS_SECRET must be set");
  }

  _db = createDb({
    AURORA_CLUSTER_ARN: clusterArn,
    DB_CREDENTIALS_SECRET: secretArn,
    AURORA_DATABASE_NAME: process.env.AURORA_DATABASE_NAME,
  });
  return _db;
}

export type Database = AwsDataApiPgDatabase<typeof schema>;
