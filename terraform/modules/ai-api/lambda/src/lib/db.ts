/**
 * RDS Data API wrapper for Aurora Serverless v2
 * Mirrors terraform/modules/api/lambda/lib/db.mjs but in TypeScript
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import type { EnvConfig } from "../types/index.js";

const client = new RDSDataClient({});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESUME_ERROR_NAME = "DatabaseResumingException";
const RESUME_MAX_RETRIES = 4;

function toParamValue(v: unknown) {
  if (v === null || v === undefined) return { isNull: true };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { longValue: v } : { stringValue: String(v) };
  if (typeof v === "boolean") return { booleanValue: v };
  return { stringValue: String(v) };
}

function isUuidString(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v);
}

function toParameter(name: string, value: unknown) {
  const param: Record<string, unknown> = { name, value: toParamValue(value) };
  if (isUuidString(value)) {
    param.typeHint = "UUID";
  }
  return param;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a SQL statement with named parameters, return rows as JSON objects.
 */
export async function execute<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
  env?: EnvConfig
): Promise<T[]> {
  const resourceArn = env?.AURORA_CLUSTER_ARN ?? process.env.AURORA_CLUSTER_ARN!;
  const secretArn = env?.DB_CREDENTIALS_SECRET ?? process.env.DB_CREDENTIALS_SECRET!;
  const database = env?.AURORA_DATABASE_NAME ?? process.env.AURORA_DATABASE_NAME ?? "zedi";

  const parameters = Object.entries(params).map(([name, value]) => toParameter(name, value));

  for (let attempt = 0; attempt < RESUME_MAX_RETRIES; attempt++) {
    try {
      const command = new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql,
        parameters: parameters.length ? (parameters as never) : undefined,
        formatRecordsAs: "JSON",
      });

      const response = await client.send(command);
      if (response.formattedRecords) {
        return JSON.parse(response.formattedRecords) as T[];
      }
      return [];
    } catch (error: unknown) {
      const isResumeError = (error as { name?: string })?.name === RESUME_ERROR_NAME;
      const isLast = attempt === RESUME_MAX_RETRIES - 1;
      if (!isResumeError || isLast) {
        throw error;
      }
      await delay(1000 * (attempt + 1));
    }
  }
  return [];
}
