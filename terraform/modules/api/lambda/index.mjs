/**
 * Zedi REST API - Lambda エントリポイント
 * C1-2: REST API 基盤（Cognito JWT 検証は API Gateway Authorizer で実施）
 */

import * as res from "./responses.mjs";
import { route } from "./router.mjs";

/**
 * API Gateway HTTP API (payload 2.0) event
 * @typedef {Object} ApiEvent
 * @property {string} rawPath
 * @property {string} rawQueryString
 * @property {Record<string, string>} [headers]
 * @property {Record<string, string>} [queryStringParameters]
 * @property {{ http: { method: string }, authorizer?: { jwt: { claims: Record<string, string> } } }} requestContext
 */

/**
 * @typedef {Object} ApiContext
 * @property {Record<string, string>|undefined} claims - JWT claims (requestContext.authorizer.jwt.claims)
 */

/**
 * @param {ApiEvent} event
 * @param {import("aws-lambda").Context} context
 */
export async function handler(event, context) {
  try {
    const method = event.requestContext?.http?.method ?? "GET";
    const rawPath = event.rawPath ?? event.path ?? "/api";
    const claims = event.requestContext?.authorizer?.jwt?.claims;

    const response = await route(rawPath, method, { claims });
    return response;
  } catch (err) {
    console.error("Lambda error:", err);
    return res.error(
      err.message || "Internal server error",
      500,
      "INTERNAL_ERROR"
    );
  }
}
