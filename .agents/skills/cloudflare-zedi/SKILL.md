---
name: cloudflare-zedi
description: >
  Zedi 固有の Cloudflare 作業ガイド。Railway → Cloudflare 移行（Issue #1088）で
  Terraform を全廃し、Wrangler（wrangler.jsonc）と Cloudflare MCP を正本にする際の
  使い分け・命名・トークンスコープ・フェーズ計画をまとめる。
  Use when working on Cloudflare for Zedi: migrating server/api, server/mcp,
  server/hocuspocus, Postgres/Redis/S3 to Workers/D1/KV/R2/Durable Objects,
  moving frontend/admin from Pages to Workers Static Assets, removing Terraform,
  or reconfiguring CI/CD. Triggers: "Cloudflare 移行", "Workers 化", "R2",
  "D1", "Durable Objects", "Terraform 廃止", "wrangler", "#1088"〜"#1095".
---

# Cloudflare for Zedi (Railway → Cloudflare 移行)

Zedi の Cloudflare 作業に着手する前に、**汎用 Cloudflare/Wrangler スキルではなく本スキルで
Zedi 固有の前提**を確認する。汎用知識は古い可能性があるため、数値・API・設定は必ず
`cloudflare-docs` MCP または公式ドキュメントで最新を取得する（retrieval over pre-training）。

_Before any Cloudflare work in Zedi, load this skill for project-specific facts.
Fetch live docs via the `cloudflare-docs` MCP rather than trusting baked-in knowledge._

## 方針（決定済み） / Decisions

- **Terraform は全廃する。** 構成の正本はリポジトリ内の `wrangler.jsonc`。DNS とドメインは
  Worker の `routes` の `custom_domain: true` に内包し、Terraform Cloud のステート管理をやめる。
  _Terraform is being removed. Source of truth = in-repo `wrangler.jsonc`._
- **フロント/admin は Pages を廃止し Workers Static Assets へ移す。** これにより Terraform が
  管理していた Pages プロジェクトと Pages 用 DNS の対象自体が消える。
  _Frontend/admin migrate from Pages to Workers Static Assets; Pages projects retired._
- **CI/CD はハイブリッド。** 品質ゲート（lint / vitest / typecheck / migration check）は
  GitHub Actions に残し、デプロイは `wrangler deploy`。PR プレビューは `wrangler versions upload`。
  _Hybrid CI/CD: GitHub Actions for gates, `wrangler deploy` for rollout, `versions upload` for PR previews._
- データ移行は **ビッグバン・カットオーバー**（Issue #1088 / #1090 の方針。デュアルライトしない）。
  _Big-bang cutover, no dual-write window._

## アクセス手段の使い分け / Which tool for what

| やりたいこと                           | 使うもの                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R2 / D1 / KV / Worker の一覧・状態確認 | Cloudflare MCP `cloudflare-bindings`（`r2_buckets_list`, `d1_databases_list`, `kv_namespaces_list`, `workers_list` 等） |
| D1 への SQL 実行・確認                 | MCP `d1_database_query`                                                                                                 |
| Worker のログ・メトリクス              | MCP `cloudflare-observability`（`query_worker_observability`）/ `wrangler tail`                                         |
| Workers Builds の状態・ログ            | MCP `cloudflare-builds`                                                                                                 |
| Cloudflare ドキュメント確認            | MCP `cloudflare-docs` の `search_cloudflare_documentation`                                                              |
| Pages→Workers 移行手順                 | MCP `migrate_pages_to_workers_guide`（移行前に必ず読む）                                                                |
| ローカル dev / deploy / secret 設定    | `bunx wrangler`（汎用 `wrangler` スキル参照）                                                                           |

**重要 / Important:** MCP ツールは呼ぶ前に必ず
`mcps/<server>/tools/<tool>.json` のスキーマを読む。

## 認証 / Auth (一度だけ / one-time)

1. **Cloudflare MCP**: Cursor のプラグインで Cloudflare に OAuth ログイン。疎通確認は
   「Workers 一覧を取得」→ `workers_list` が返ること。
2. **ローカル Wrangler**: `bunx wrangler whoami`。未ログインなら `wrangler login`、
   または移行用トークンを env に設定（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）。
   必要スコープは [references/token-scopes.md](references/token-scopes.md)。
3. 既存 GitHub Secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` は **同一アカウント・
   同一ゾーン**。Pages deploy と（廃止予定の）Terraform CI が現在使用中。

## Zedi のリソース対応 / Resource map

現状の Railway サービスと Cloudflare 移行先・サブ Issue の対応は
[references/resource-map.md](references/resource-map.md) を正とする。
ドメイン・プロジェクト名・環境名の固定値は [references/naming.md](references/naming.md)。

## 移行フェーズ / Migration phases

フェーズ順・各フェーズの検証基準・削除対象は
[references/migration-plan.md](references/migration-plan.md) に従う。1 フェーズ = 1 PR を基本とし、
各 PR で「実装 → MCP で状態確認 → health/SHA 検証」のループを回す。

## やってはいけないこと / Guardrails

- **Terraform に新規リソースを足さない。** 移行対象（Workers/R2/D1/KV/DO）はすべて
  `wrangler.jsonc` で管理する。Terraform は Phase 5 でまとめて削除するまで「凍結」。
  _Do not add new resources to Terraform; it is frozen until removal in Phase 5._
- **DNS を Terraform と Wrangler で二重管理しない。** カットオーバー時は Worker の
  `custom_domain` 側へ寄せ、旧 Terraform レコードは同一 PR で除去（または Phase 5 で一括）。
- **Secrets をリポジトリに置かない。** Worker の秘密値は `wrangler secret put`。
  `.env.example` には鍵名とコメントのみ。
- スキーマ変更時は Zedi の DB ルール（[AGENTS.md](../../../AGENTS.md) §DB スキーマ変更）に従う。
  Postgres → D1 移行（#1090）では `drizzle-migration-check` ガードも D1 用に更新する。
