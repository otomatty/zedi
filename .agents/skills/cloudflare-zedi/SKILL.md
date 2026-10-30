---
name: cloudflare-zedi
description: >
  Zedi 固有の Cloudflare 作業ガイド。作り直したアプリ（app/）を Worker 1 本
  （Static Assets + Hono + D1 + Durable Objects）で配信する構成、Terraform の廃止、
  ツールの使い分け・命名・トークンスコープをまとめる。
  Use when working on Cloudflare for Zedi: deploying app/ (wrangler.jsonc, D1,
  Durable Objects, secrets, custom domains), removing Terraform and the old Pages
  projects, or reconfiguring CI/CD. Triggers: "Cloudflare", "デプロイ", "D1",
  "Durable Objects", "Terraform 廃止", "wrangler", "#1088".
---

# Cloudflare for Zedi

Zedi の Cloudflare 作業に着手する前に、**汎用 Cloudflare/Wrangler スキルではなく本スキルで
Zedi 固有の前提**を確認する。汎用知識は古い可能性があるため、数値・API・設定は必ず
`cloudflare-docs` MCP または公式ドキュメントで最新を取得する（retrieval over pre-training）。

_Before any Cloudflare work in Zedi, load this skill for project-specific facts.
Fetch live docs via the `cloudflare-docs` MCP rather than trusting baked-in knowledge._

## 現状（2026-10） / Status

- **アプリは `app/` に作り直している。** Worker 1 本（`zedi-app`）が Static Assets・Hono の API・
  Better Auth・D1・Durable Objects（共同編集）を持つ。構成の正本は
  [`app/wrangler.jsonc`](../../../app/wrangler.jsonc)。D1 の `database_id` はまだプレースホルダーで、
  ローカル（`wrangler dev` / `wrangler d1 migrations apply DB --local`）でだけ動かしている。
  _The rebuilt app is one Worker; it only runs locally for now._
- **デプロイは何もしていない。** 旧バックエンド（`server/api`・`server/mcp`・`server/hocuspocus`）、
  Railway、dev の API / MCP Worker、現行フロント / admin のデプロイ（`deploy-dev.yml` /
  `deploy-prod.yml`）はリポジトリから削除済み。
  _Nothing is deployed from the repository right now._
- **Terraform は残っている（廃止予定）。** `terraform/cloudflare/{shared,dev,prod}` が旧フロント /
  admin の Pages プロジェクト（`zedi` / `zedi-admin` / `zedi-dev` / `zedi-admin-dev`）と、その
  カスタムドメインの CNAME を管理している。
- **本番データはない。** カットオーバーはドメインを `app/` の Worker に向けるだけで、データ移行や
  デュアルライトはしない。

## 方針（決定済み） / Decisions

- **Terraform は全廃する。** DNS とドメインは Worker の `routes` の `custom_domain: true` に内包し、
  Terraform Cloud のステート管理をやめる。
  _Terraform is being removed. Source of truth = `app/wrangler.jsonc`._
- **Pages は使わない。** 静的ファイルは `app/` の Worker の Static Assets で配信する。
- **CI/CD はハイブリッド。** 品質ゲート（lint / vitest / typecheck / workerd 統合テスト /
  スモークテスト）は GitHub Actions、デプロイは `wrangler deploy`、PR プレビューは
  `wrangler versions upload` またはプレビュー環境。
  _Hybrid CI/CD: GitHub Actions for gates, `wrangler deploy` for rollout._
- Durable Objects を持つ Worker では次の制約を前提に設計する（数値・仕様はデプロイ前に公式で再確認）:
  - バージョン URL（プレビュー URL）が作られない。
  - 段階デプロイでは各 DO が 1 つのバージョンに固定される。
  - DO のクラス追加・削除（`migrations`）は通常の `wrangler deploy` が必要。

## アクセス手段の使い分け / Which tool for what

| やりたいこと                           | 使うもの                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R2 / D1 / KV / Worker の一覧・状態確認 | Cloudflare MCP `cloudflare-bindings`（`r2_buckets_list`, `d1_databases_list`, `kv_namespaces_list`, `workers_list` 等） |
| D1 への SQL 実行・確認                 | MCP `d1_database_query`                                                                                                 |
| Worker のログ・メトリクス              | MCP `cloudflare-observability`（`query_worker_observability`）/ `wrangler tail`                                         |
| Cloudflare ドキュメント確認            | MCP `cloudflare-docs` の `search_cloudflare_documentation`                                                              |
| ローカル dev / deploy / secret 設定    | `app/` で `bunx wrangler`（汎用 `wrangler` スキル参照）                                                                 |

**重要 / Important:** MCP ツールは呼ぶ前に必ず
`mcps/<server>/tools/<tool>.json` のスキーマを読む。

## 認証 / Auth (一度だけ / one-time)

1. **Cloudflare MCP**: プラグインで Cloudflare に OAuth ログイン。疎通確認は
   「Workers 一覧を取得」→ `workers_list` が返ること。
2. **ローカル Wrangler**: `bunx wrangler whoami`。未ログインなら `wrangler login`、
   またはトークンを env に設定（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）。
   必要スコープは [references/token-scopes.md](references/token-scopes.md)。
3. GitHub Secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` は **同一アカウント・同一ゾーン**。
   今使っているのは Terraform のワークフローだけ。

ドメイン・Worker 名・バケット名の固定値は [references/naming.md](references/naming.md)。

## `app/` を初めてデプロイするとき / First deploy of app/

1. D1 を作る（`wrangler d1 create`）。`app/wrangler.jsonc` の `database_id` を実際の ID に置き換え、
   `wrangler d1 migrations apply DB --remote` を流す。
2. Secrets を登録する（`wrangler secret put BETTER_AUTH_SECRET` など。必要な鍵は
   [`app/.dev.vars.example`](../../../app/.dev.vars.example) を参照）。`ENVIRONMENT=development` は
   マジックリンクの受信箱を公開するので、デプロイ先には絶対に設定しない。
3. 使うドメインの旧 Pages カスタムドメインと Terraform の CNAME を先に外す。残っていると
   `custom_domain` の作成が衝突する（以前の dev デプロイが失敗した原因の一つ）。
4. `routes` に `{ "pattern": "<domain>", "custom_domain": true }` を足して `wrangler deploy`。
5. `wrangler tail` / observability でサインインと共同編集の疎通を確認する。

## Terraform の廃止 / Removing Terraform

- Pages プロジェクトと CNAME を Terraform から外して Apply する（または `terraform state rm` で
  ステートから外し、ダッシュボードで削除する）。
- その後 `terraform/` と `terraform-cloudflare-*.yml` を削除し、GitHub Secret `TF_API_TOKEN` と
  Terraform Cloud のワークスペース変数を消す。

## やってはいけないこと / Guardrails

- **Terraform に新規リソースを足さない。** Workers / D1 / R2 / KV / DO はすべて
  `app/wrangler.jsonc` で管理する。
- **DNS を Terraform と Wrangler で二重管理しない。** ドメインを Worker の `custom_domain` に
  移すときは、旧 Terraform レコードを同じ作業で外す。
- **Secrets をリポジトリに置かない。** Worker の秘密値は `wrangler secret put`、ローカルは
  `app/.dev.vars`（gitignore）。`.dev.vars.example` には鍵名とコメントのみ。
- D1 のスキーマ変更は [AGENTS.md](../../../AGENTS.md) §DB スキーマ変更に従う
  （`app/migrations/` と Drizzle スキーマを同じ PR で更新する）。
