# Deployment Architecture — api-worker

前提: nfr-design 5 成果物（logical-components.md の LC-1〜6、performance/security/scalability/reliability-design.md）を実現する配置。application-design（components.md / services.md）と functional-design（business-logic-model.md）は infra スコープにより不在 — logical-components.md が正本。

## 構成トポロジ（本 Issue 完了時点）

```
[Browser/Clients]
     |
     +--> Railway: zedi api (src/index.ts, Node)   <- 本番トラフィック（不変, A-3）
     |        +--> Railway Postgres / Redis / R2(S3互換)
     |
     +--> Cloudflare: zedi-api-dev (src/worker.ts) <- dev 検証専用
              +--> R2 binding STORAGE_BUCKET (zedi-storage-dev)
              +--> DO binding KV_DO (KvDurableObject, SQLite classes)
              +--> (DB なし — #1090 まで DB 依存経路は マスク済み 5xx)
```

<!-- Text fallback: クライアントは本番では Railway の Node API に接続し続ける。dev 検証用に Cloudflare Worker zedi-api-dev が並行稼働し、R2 と Durable Object のみをバインドする。DB は未接続。 -->

## Worker 環境（wrangler.jsonc 実体、確認済み）

| env | Worker 名 | R2 | DO | vars |
|-----|----------|----|----|------|
| dev | `zedi-api-dev` | `zedi-storage-dev` | `KV_DO` → `KvDurableObject` | `ENVIRONMENT=development` |
| production | `zedi-api` | `zedi-storage-prod` | 同上 | `ENVIRONMENT=production`（本 Issue ではデプロイしない — Q8=B） |

- `compatibility_flags: ["nodejs_compat"]`、`compatibility_date: 2026-06-25`、`observability.enabled: true`（実体確認済み）。
- **追加変更**: `RUNTIME: "cloudflare-workers"` var を全 env に追加（LC-3 のランタイム判定シグナル。`ENVIRONMENT` は dev/prod の区別であってランタイム判別ではないため別 var とする）。
- DNS / custom_domain の変更はしない（prod 切替は Out of Scope）。

## エントリポイントと成果物

- Worker: `src/worker.ts` = `withSentry(...)` でラップした Hono app（agent ルートなし、LC-1/LC-2）+ `KvDurableObject` named export。
- Node: `src/index.ts` 無変更（Railway 並行稼働、NFR-2）。
- デプロイ単位: `wrangler deploy --env dev`（CI）。バンドルは LC-5 の dry-run 検査を通過したもののみ。

## Review

**Verdict**: READY
**Reviewer**: aidlc-architecture-reviewer-agent
**Date**: 2026-07-18

### Findings

（adversarial 照合: 5 成果物の全リポジトリ事実主張を実体と突き合わせ。blocker / major なし。）

- **[verified] wrangler.jsonc 主張は全一致。** `server/api/wrangler.jsonc` 実体: env 名 `zedi-api-dev` / `zedi-api`、R2 `zedi-storage-dev` / `zedi-storage-prod`（binding `STORAGE_BUCKET`）、DO `KV_DO` → `KvDurableObject`、migrations `v1`（`new_sqlite_classes`）、`nodejs_compat`、`compatibility_date: 2026-06-25`、`observability.enabled: true`、`ENVIRONMENT` vars（development/production）。`RUNTIME` var は**未存在** — 「追加変更」フレーミングと整合（既存と偽っていない）。
- **[verified] CI/CD 主張は実体一致。** `deploy-api-worker-dev.yml`: `develop` push + paths `server/api/**` → `wrangler deploy --env dev`、health-poll は `curl --fail` かつ `vars.WORKER_API_BASE_URL != ''` ゲート（「未設定時スキップ」記述どおり）。`ci.yml`: `api-typecheck`（`bun install --frozen-lockfile` → `bunx tsc --noEmit`, L265-287）/ `api-test`（→ `bunx vitest run --coverage`, L289-317）実在。
- **[verified] Secrets 経路。** `server/api/scripts/putWorkerSecrets.ts` 実在、`wrangler secret bulk` 一括投入（`worker:secrets:put`）。`.env.worker.{dev,production}.example` に `SENTRY_DSN_API` は**未記載** — infrastructure-services.md の「追記する」は正しい（既存と偽っていない）。実ファイル `.env.worker.dev` / `.env.worker.production` の gitignore を `git check-ignore` で確認（SR-4 整合）。`/api/health` の `runtime` フィールドは `health.ts:35` に実在（monitoring-design の手動検証対象として妥当）。
- **[verified] スコープ逸脱なし。** prod route / custom_domain / DNS 変更なし（Q8=B、Out of Scope 準拠）、Hyperdrive・D1 は明示的不作成（TS-3 / #1090）、Terraform 凍結維持（C-3）、prod デプロイワークフロー不作成（cicd-pipeline.md）。`RUNTIME` var の production env への追加は構成編集のみでデプロイを伴わず、C-3（wrangler.jsonc 正本）の範囲内。
- **[verified] 上流整合。** LC-1〜6 / SR-1〜7 / PR-1〜6 / SC-1〜4 / RL-1〜5 / TS-3 / TS-9 / C-1〜4 / A-3 の参照は全て nfr-design（READY 済み）・nfr-requirements・requirements.md に解決。application-design / functional-design の不在は infra スコープの設計どおりで、5 成果物とも logical-components.md を正本と明記。ゼロ質問根拠（全判断が確定済み・新規リソースなし）は上記実体確認と矛盾しない。
- **[minor] LC-5 検査とデプロイの順序は機械的に強制されない。** 「バンドルは LC-5 の dry-run 検査を通過したもののみ」とあるが、`worker:bundle:check` は `ci.yml` 追加であり、`deploy-api-worker-dev.yml` は同じ develop push で**並列に**起動する（ci.yml の成功を待たない）。dev 検証専用 Worker のため実害は小さいが、保証したいなら deploy job 内に dry-run 検査ステップを置くか、ブランチ保護で担保する旨を一行明記すべき。
- **[minor] 資格情報前提の明示は十分だが検証は未完。** C-2（別アカウント wrangler / CI トークン失効）により本設計の実デプロイ経路は現時点で end-to-end 未検証。設計は資格情報不要な検査（dry-run、workerd テスト）を CI に置く構成で C-2 を正しく回避しており、復旧後の手動確認手段（`wrangler tail` / MCP）も monitoring-design に記載済み — 設計上の欠陥ではなく残存リスクとしての記録。
