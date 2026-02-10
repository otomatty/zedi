/**
 * RDS Data API ラッパー（Aurora Serverless v2）
 * Lambda 環境変数: AURORA_CLUSTER_ARN, DB_CREDENTIALS_SECRET, AURORA_DATABASE_NAME
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESUME_ERROR_NAME = "DatabaseResumingException";
const RESUME_MAX_RETRIES = 4;

function getConfig() {
  const arn = process.env.AURORA_CLUSTER_ARN;
  const secret = process.env.DB_CREDENTIALS_SECRET;
  const database = process.env.AURORA_DATABASE_NAME || "zedi";
  if (!arn || !secret) {
    throw new Error("AURORA_CLUSTER_ARN and DB_CREDENTIALS_SECRET must be set");
  }
  return { resourceArn: arn, secretArn: secret, database };
}

/**
 * プリミティブを RDS Data API の value に変換
 * @param {string|number|boolean|null|undefined} v
 * @returns {{ stringValue?: string; longValue?: number; booleanValue?: boolean; isNull?: boolean }}
 */
function toParamValue(v) {
  if (v === null || v === undefined) return { isNull: true };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return { longValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  return { stringValue: String(v) };
}

function isUuidString(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

function toParameter(name, value) {
  const param = {
    name,
    value: toParamValue(value),
  };
  // Help RDS Data API bind UUID values correctly so "uuid = :param" works.
  if (isUuidString(value)) {
    param.typeHint = "UUID";
  }
  return param;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 名前付きパラメータで SQL を実行し、JSON 形式で結果を返す
 * @param {string} sql - :name 形式のパラメータ付き SQL
 * @param {Record<string, string|number|boolean|null|undefined>} params
 * @returns {Promise<Record<string, unknown>[]>} 行の配列（column name -> value）
 */
export async function execute(sql, params = {}) {
  const { resourceArn, secretArn, database } = getConfig();
  const parameters = Object.entries(params).map(([name, value]) => toParameter(name, value));

  for (let attempt = 0; attempt < RESUME_MAX_RETRIES; attempt++) {
    try {
      const command = new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql,
        parameters: parameters.length ? parameters : undefined,
        formatRecordsAs: "JSON",
      });

      const response = await client.send(command);
      if (response.formattedRecords) {
        return JSON.parse(response.formattedRecords);
      }
      return [];
    } catch (error) {
      const isResumeError = error?.name === RESUME_ERROR_NAME;
      const isLast = attempt === RESUME_MAX_RETRIES - 1;
      if (!isResumeError || isLast) {
        throw error;
      }
      // Aurora Serverless may need several seconds to resume from auto-pause.
      await delay(1000 * (attempt + 1));
    }
  }
  return [];
}
