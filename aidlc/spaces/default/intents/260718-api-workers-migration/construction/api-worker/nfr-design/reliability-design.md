# Reliability Design — api-worker

前提: reliability-requirements.md（RL-1〜5）を実現する設計。business-logic-model.md は infra スコープにより未作成。

## フェイルセーフ構成（RL-1, RL-2）

- サーキットブレーカ・リトライ・フェイルオーバは**追加しない**。Railway 並行稼働（`src/index.ts` 無変更）がそのままフォールバックであり、dev Worker の障害はユーザー影響を持たない。
- ロールバック手順 = 不要（dev Worker は検証専用。prod 切替 PR で設計する）。

## 障害時挙動の整形（RL-3）

- DB 依存ルートの失敗（#1090 まで不可避）は、`app.onError` → `errorHandler.ts` の経路で捕捉されマスク済み 5xx になることを workerd テストでアサートする。判定基準: Workers の 1101（uncaught exception）ではなく HTTP 500 + `{ error: "Internal server error" }` が返ること。
- `getPool`/`getDb` の lazy 初期化（`db/client.ts`）により、DB 未接続でも import 時・起動時にはクラッシュしないことを worker 起動テストで確認する。

## エラー可観測性（RL-4）

- `@sentry/cloudflare`（LC-4 DI）で dev Worker の例外を捕捉。DSN 未設定時は no-op（`SENTRY_DSN_API` 契約は現行 `sentry.ts:50` と同一）。
- Cloudflare 側 observability（`wrangler tail` / MCP）は資格情報復旧後の手動検証手段として位置づける。

## デプロイ健全性（RL-5）

- CI 自動: `deploy-api-worker-dev.yml` の `curl --fail` health-poll（HTTP 成功判定のみ）維持。
- 手動 dev 検証: `runtime: "cloudflare-workers"` フィールドの確認（FR-6.2 帰属）。
