# Reliability Requirements — api-worker

前提: business-logic-model.md / business-rules.md は infra スコープにより未作成。requirements.md（A-3、FR-6、Out of Scope）から導出する。

## 可用性

- RL-1: SLA/SLO は設定しない。本番トラフィックは Railway が引き続き担い（A-3）、dev Worker は検証専用のため可用性保証は不要。
- RL-2: ロールバック戦略 = 「何もしない」。Railway 並行稼働が生きている限り、dev Worker の障害はユーザー影響ゼロ。prod 切替時のロールバック設計は切替 PR（Out of Scope）で行う。

## 障害時挙動

- RL-3: DB 依存ルートは #1090 まで dev Worker 上で失敗するが、その失敗は SR-3 のマスク済み 5xx（`{ error: string }`）として整形されること — Worker ランタイム例外（unhandled rejection / 1101 エラー）にしないこと（FR-5.2 / FR-6.2 の判定基準）。
- RL-4: Sentry（@sentry/cloudflare、FR-3）で dev Worker のエラーを捕捉し、DSN 未設定時は no-op で落ちないこと。

## デプロイ健全性

- RL-5: `deploy-api-worker-dev.yml` の health-poll（/api/health の HTTP 成功判定 = CI 自動）をデプロイ成功条件として維持する（FR-6.1）。レスポンス中の `runtime` フィールド確認は CI ではなく FR-6.2 の手動 dev 検証に属する。
