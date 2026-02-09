#!/usr/bin/env node
/**
 * Lambda ハンドラーをローカルで実行（モックイベント）
 * 用途: ルーティング・認証の動作確認。DB 要のルートは AURORA_* 未設定時 500 になる。
 * 使用例: node run-local.mjs
 * 環境変数: AURORA_CLUSTER_ARN, DB_CREDENTIALS_SECRET, AURORA_DATABASE_NAME があれば DB 接続を試行
 */

import { handler } from "./index.mjs";

const mockContext = { awsRequestId: "local", getRemainingTimeInMillis: () => 30000 };

const events = [
  { name: "GET /api/health", event: { requestContext: { http: { method: "GET" } }, rawPath: "/api/health" } },
  {
    name: "GET /api/me (with claims)",
    event: {
      requestContext: {
        http: { method: "GET" },
        authorizer: { jwt: { claims: { sub: "test-sub", email: "test@example.com" } } },
      },
      rawPath: "/api/me",
    },
  },
  {
    name: "GET /api/pages/00000000-0000-0000-0000-000000000001/content (needs DB)",
    event: {
      requestContext: {
        http: { method: "GET" },
        authorizer: { jwt: { claims: { sub: "test-sub" } } },
      },
      rawPath: "/api/pages/00000000-0000-0000-0000-000000000001/content",
    },
  },
  {
    name: "GET /api/notes (needs DB)",
    event: {
      requestContext: {
        http: { method: "GET" },
        authorizer: { jwt: { claims: { sub: "test-sub" } } },
      },
      rawPath: "/api/notes",
    },
  },
];

async function main() {
  for (const { name, event } of events) {
    process.stdout.write(`\n--- ${name} ---\n`);
    try {
      const res = await handler(event, mockContext);
      console.log("Status:", res.statusCode);
      console.log("Body:", res.body?.slice(0, 200) + (res.body?.length > 200 ? "..." : ""));
    } catch (err) {
      console.error("Error:", err.message);
    }
  }
  console.log("\nDone.");
}

main();
