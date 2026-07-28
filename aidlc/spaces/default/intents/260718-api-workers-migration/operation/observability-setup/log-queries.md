# Log Queries — api-worker (#1091)

前提: monitoring-design.md の手動確認手段を実行可能なコマンドとして確定する。ローカル wrangler は正アカウントで検証済み（validation-report.md）。

## 実装 PR の dev 検証で使うクエリ

```bash
# ライブテイル（dev Worker の全リクエスト＋例外）
cd server/api && bunx wrangler tail --env dev

# エラーのみ
bunx wrangler tail --env dev --status error

# health 確認（URL 確定後）
curl -s $WORKER_API_BASE_URL/api/health | jq .runtime   # 期待: "cloudflare-workers"
```

## 確認観点（smoke-test-results.md の計画と対応）

- 1101（uncaught exception）が出ないこと — マスク済み 5xx への整形（RL-3）の実地確認。
- `exceeded CPU` が出ないこと（PR-4）。
- Sentry 側にイベントが届くこと（DSN 投入後、withSentry の flush 確認）。
