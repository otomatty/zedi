#!/usr/bin/env node
/**
 * C1-9: API 統合テスト（Lambda ハンドラーをモックイベントで実行し、期待する status / body を検証）
 * 使用例: node test-api.mjs
 * 成功時 exit 0、失敗時 exit 1
 */

import { handler } from "./index.mjs";

const mockContext = { awsRequestId: "test", getRemainingTimeInMillis: () => 30000 };

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

async function run(name, event, expectations) {
  const res = await handler(event, mockContext);
  assert(res && typeof res.statusCode === "number", `${name}: response has statusCode`);
  assert(res.statusCode === expectations.status, `${name}: expected status ${expectations.status}, got ${res.statusCode}`);
  if (expectations.bodyOk !== undefined) {
    let data;
    try {
      data = JSON.parse(res.body || "{}");
    } catch (_) {
      throw new Error(`${name}: body is not JSON`);
    }
    if (expectations.bodyOk) {
      assert(data.ok === true, `${name}: expected ok: true, got ${JSON.stringify(data).slice(0, 80)}`);
    } else {
      assert(data.ok === false, `${name}: expected ok: false, got ${JSON.stringify(data).slice(0, 80)}`);
    }
  }
  if (expectations.bodyContains) {
    assert(
      (res.body || "").includes(expectations.bodyContains),
      `${name}: body should contain "${expectations.bodyContains}"`
    );
  }
}

async function main() {
  const tests = [
    ["GET /api/health (no auth)", { requestContext: { http: { method: "GET" } }, rawPath: "/api/health" }, { status: 200, bodyOk: true }],
    ["GET /api/me (with claims)", { requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { sub: "s1", email: "e@x.com" } } } }, rawPath: "/api/me" }, { status: 200, bodyOk: true }],
    ["GET /api/users (no path id) -> 404", { requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { sub: "s1" } } } }, rawPath: "/api/users" }, { status: 404 }],
    ["GET /api/search (scope missing) -> 400", { requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { sub: "s1" } } } }, rawPath: "/api/search", queryStringParameters: { q: "x" } }, { status: 400, bodyOk: false, bodyContains: "scope=shared" }],
    ["OPTIONS /api/health -> 204", { requestContext: { http: { method: "OPTIONS" } }, rawPath: "/api/health" }, { status: 204 }],
    ["GET /api/unknown -> 404", { requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { sub: "s1" } } } }, rawPath: "/api/unknown" }, { status: 404 }],
    ["GET /api (no token) -> 401", { requestContext: { http: { method: "GET" } }, rawPath: "/api/me" }, { status: 401, bodyOk: false }],
  ];

  let passed = 0;
  for (const [name, event, expectations] of tests) {
    try {
      await run(name, event, expectations);
      passed++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\nFAIL: ${name}`);
      console.error(err.message);
      process.exit(1);
    }
  }
  console.log(`\n${passed}/${tests.length} tests passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
