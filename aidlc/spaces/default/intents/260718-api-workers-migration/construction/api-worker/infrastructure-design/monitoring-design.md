# Monitoring Design — api-worker

前提: reliability-design.md（RL-3〜5）・logical-components.md（LC-4）の可観測性要求を実現する。application-design / business-logic-model.md は infra スコープにより不在。

## エラー監視

- Sentry: Worker は `withSentry` ラッパ（LC-4、`SENTRY_DSN_API` secret）。Node/Railway は既存 `@sentry/node` 不変。DSN 未設定なら no-op。
- スクラブ（`scrubSentryEvent`、`sendDefaultPii: false`）は両ランタイム共通実装。

## プラットフォーム可観測性

- `wrangler.jsonc` の `observability.enabled: true`（設定済み）により Workers Logs / invocation logs が有効。
- 資格情報復旧後の手動確認手段: `wrangler tail` / Cloudflare MCP `query_worker_observability`（cloudflare-zedi スキルの使い分け表に従う）。

## ヘルスチェック

- `/api/health`: CI 自動は HTTP 成功判定（`deploy-api-worker-dev.yml` の `curl --fail`）、`runtime: "cloudflare-workers"` フィールドの確認は手動 dev 検証（RL-5 の帰属どおり）。

## 本 Issue で追加しないもの

- アラート・ダッシュボード・SLO 監視（dev 検証専用のため。prod 切替時に設計）。
