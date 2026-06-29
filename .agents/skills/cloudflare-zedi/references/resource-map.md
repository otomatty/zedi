# リソース対応表 / Resource map (Issue #1088)

現状の Railway 等のサービスと Cloudflare 移行先・サブ Issue・確認用 MCP の対応。
出典: [Issue #1088](https://github.com/otomatty/zedi/issues/1088)。

| #   | 現状                          | 役割                              | 移行先 (Cloudflare)                                                | サブ Issue | 確認に使う MCP                            |
| --- | ----------------------------- | --------------------------------- | ------------------------------------------------------------------ | ---------- | ----------------------------------------- |
| 1   | フロント `zedi`               | React/Vite SPA                    | **Workers Static Assets**（旧 Pages）                              | #1088 本体 | `workers_list`                            |
| 2   | 管理画面 `zedi-admin`         | React/Vite SPA                    | **Workers Static Assets**（旧 Pages）                              | #1088 本体 | `workers_list`                            |
| 3   | S3 互換ストレージ             | メディア・サムネ・PDF ハイライト  | **R2**                                                             | #1089      | `r2_buckets_list` / `r2_bucket_create`    |
| 4   | Railway PostgreSQL            | 主 DB (Drizzle)                   | **D1（コントロールプレーン）＋ ノート単位 DO ＋ ユーザーシャード** | #1090      | `d1_databases_list` / `d1_database_query` |
| 5   | `server/api` (Hono)           | 認証・REST・AI チャット           | **Workers**                                                        | #1091      | `workers_list` / `workers_get_worker`     |
| 6   | `server/mcp` (Hono + MCP SDK) | 外部 MCP クライアント連携         | **Workers**                                                        | #1092      | `workers_list`                            |
| 7   | Railway Redis                 | レート制限・deny-list・キャッシュ | **KV / Durable Objects**                                           | #1093      | `kv_namespaces_list`                      |
| 8   | `server/hocuspocus` (WS/Yjs)  | リアルタイム共同編集 (CRDT)       | **Durable Objects**                                                | #1094      | `observability` / `wrangler tail`         |
| 9   | LangGraph (server/api 内蔵)   | Wiki Compose / Research Loop      | **Workflows / Queues**                                             | #1095      | `cloudflare-docs`                         |

## 横断的な確認事項 / Cross-cutting

- Workers の `nodejs_compat` で `@aws-sdk/client-s3` / `ioredis` の動作確認（`pg` は Postgres 廃止で不要化）。
- Drizzle を SQLite 方言へ移植（`text[]` / `jsonb` / `gen_random_uuid()` / ILIKE→FTS5 の書き換え。詳細は #1090）。
- Better Auth（`BETTER_AUTH_SECRET` 共有）を D1 アダプタ＋KV セッションキャッシュで動かす。
- Secrets を Railway → Cloudflare へ（`wrangler secret put`）。
- CORS / `TRUST_PROXY` の見直し。
- コスト試算（Workers / DO / D1 / R2 / KV）。

## #1090 / #1094 / #1095 は一体設計 / Designed together

ノート単位 Durable Object は #1094 のリアルタイム層と同一オブジェクトに統合し、
ユーザーシャードの LangGraph チェックポイントは #1095 に依存する。Phase 4 でまとめて実施。
