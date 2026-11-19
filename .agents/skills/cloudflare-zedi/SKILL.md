---
name: cloudflare-zedi
description: >
  Zedi 固有の Cloudflare 作業ガイド。作り直したアプリ（app/）を Worker 1 本
  （Static Assets + Hono + D1 + Durable Objects）で配信する構成、旧リソースの片付け、
  ツールの使い分け・命名・トークンスコープをまとめる。
  Use when working on Cloudflare for Zedi: deploying app/ (wrangler.jsonc, D1,
  Durable Objects, secrets, custom domains), cleaning up the old Pages projects and
  DNS records, or reconfiguring CI/CD. Triggers: "Cloudflare", "デプロイ", "D1",
  "Durable Objects", "DNS", "wrangler", "#1088".
---

# Cloudflare for Zedi

Zedi の Cloudflare 作業に着手する前に、**汎用 Cloudflare/Wrangler スキルではなく本スキルで
Zedi 固有の前提**を確認する。汎用知識は古い可能性があるため、数値・API・設定は必ず
`cloudflare-docs` MCP または公式ドキュメントで最新を取得する（retrieval over pre-training）。

_Before any Cloudflare work in Zedi, load this skill for project-specific facts.
Fetch live docs via the `cloudflare-docs` MCP rather than trusting baked-in knowledge._

## 現状（2026-11） / Status

- **常設環境は staging と本番。** 実装と試験はローカルの `wrangler dev` で行う。
- **両環境の Worker はデプロイ済み。** `env.production` は `zedi-app`、`env.staging` は
  `zedi-app-staging`。各 Worker が Static Assets・Hono の API・Better Auth・D1・Durable Objects（共同編集）を持つ。
  独自ドメインの設定は今後行う。`workers_dev` と `preview_urls` は両環境で `false`。
- **D1 は両環境とも作成済み。** 本番は `zedi-app`、staging は `zedi-app-staging`。
  ID は [`app/wrangler.jsonc`](../../../app/wrangler.jsonc) にあり、最上位のローカル用 `database_id` だけがプレースホルダー。
- **ドメインの予定** は本番が `zedi-note.app`、staging が `staging.zedi-note.app`。staging は Cloudflare Access の内側に置く。
  Preview（`<名前>.preview.zedi-note.app`）、管理用の Worker、探索的テストは #1157 の残作業。
- **本番データはない。** カットオーバーはドメインを `app/` の Worker に向けるだけで、データ移行や
  デュアルライトはしない。

## 方針（決定済み） / Decisions

- **IaC は `app/wrangler.jsonc` だけ。** DNS とドメインは Worker の `routes` の
  `custom_domain: true` に内包する。Terraform は使わない。
  _Source of truth = `app/wrangler.jsonc`; Terraform has been removed._
- **Pages は使わない。** 静的ファイルは `app/` の Worker の Static Assets で配信する。
- **CI/CD はハイブリッド。** 品質ゲート（lint / vitest / typecheck / workerd 統合テスト /
  スモークテスト）は GitHub Actions。デプロイは [`deploy.yml`](../../../.github/workflows/deploy.yml) を
  手動で実行し、`staging` または `production` を選ぶ。型チェック、テスト、ビルドの順に実行し、
  `wrangler d1 migrations apply DB --env <env> --remote`、`wrangler deploy --env <env>` の順で反映する。
  staging は任意のブランチから実行できる。本番は `main` から、同じコミットの staging デプロイが成功済みの場合だけ実行できる。
  _GitHub Actions runs quality gates and dispatches Wrangler deployments to the selected environment._
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
| ローカル dev / secret 設定             | `app/` で `bunx wrangler`（汎用 `wrangler` スキル参照）                                                                 |

**重要 / Important:** MCP ツールは呼ぶ前に必ず
`mcps/<server>/tools/<tool>.json` のスキーマを読む。

## 認証 / Auth (一度だけ / one-time)

1. **Cloudflare MCP**: プラグインで Cloudflare に OAuth ログイン。疎通確認は
   「Workers 一覧を取得」→ `workers_list` が返ること。
2. **ローカル Wrangler**: `bunx wrangler whoami`。未ログインなら `wrangler login`、
   またはトークンを env に設定（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）。
   必要スコープは [references/token-scopes.md](references/token-scopes.md)。
3. GitHub の Environment `staging` と `production` にそれぞれ
   `CLOUDFLARE_API_TOKEN`（`zedi-github-deploy`）と `CLOUDFLARE_ACCOUNT_ID` を Secrets として設定する。
   デプロイ後の確認を有効にするには変数 `APP_URL` を設定する。Cloudflare Access 用の
   `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` は任意の Secrets。

ドメイン・Worker 名・バケット名の固定値は [references/naming.md](references/naming.md)。

## 新しい環境を足すとき / Adding an environment

1. D1 を作り（`wrangler d1 create`）、`app/wrangler.jsonc` の対象環境にバインディングと実際の ID を設定する。
2. 対象環境の Worker Secrets を登録する（`wrangler secret put BETTER_AUTH_SECRET --env <env>` など）。
   鍵は [`app/.dev.vars.example`](../../../app/.dev.vars.example) を参照。`ENVIRONMENT=development` は
   サインインしたユーザーにページの一括投入を許可するため、ローカルに限定する。テスト用 IdP（`TEST_IDP`）は
   staging と Preview に限定する（otomatty/zedi#1156）。
3. ドメインを設定するときは、対象環境の `routes` に `{ "pattern": "<domain>", "custom_domain": true }` を足す。
   常設環境の通常デプロイには上記の `deploy.yml` を使う。

## 旧リソースの片付け / Cleaning up old resources

旧 Pages プロジェクト、旧 DNS レコード、dev の Worker、Terraform Cloud のワークスペース、
GitHub の `TF_API_TOKEN` / `DATABASE_URL` / 旧ビルド用変数は削除済み（#1154）。

## やってはいけないこと / Guardrails

- **Workers / D1 / R2 / KV / DO はすべて `app/wrangler.jsonc` で管理する。** ダッシュボードで
  作ったリソースは、作業の最後に設定へ反映する。
- **DNS を手作業と Wrangler で二重管理しない。** ドメインは Worker の `custom_domain` に任せ、
  同じ名前の手動レコードは残さない。
- **Secrets をリポジトリに置かない。** Worker の秘密値は `wrangler secret put`、ローカルは
  `app/.dev.vars`（gitignore）。`.dev.vars.example` には鍵名とコメントのみ。
- D1 のスキーマ変更は [AGENTS.md](../../../AGENTS.md) §DB スキーマ変更に従う
  （`app/migrations/` と Drizzle スキーマを同じ PR で更新する）。
