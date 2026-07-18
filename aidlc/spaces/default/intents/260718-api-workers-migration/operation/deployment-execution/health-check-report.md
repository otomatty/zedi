# Health Check Report — api-worker (#1091) 2026-07-18

前提: deployment-log.md の既存デプロイに対するヘルス確認の実測結果。cd-config.md の health-poll 設計と突き合わせる。

## 公開 URL 経由のヘルスチェック: 実行不可（記録）

- リポジトリ変数 `WORKER_API_BASE_URL` は**未設定**（`gh variable list` 空）。CI の health-poll ステップも `if:` ガードによりスキップされている状態。
- workers.dev サブドメイン URL はリポジトリからは確定できず、公開経路の疎通確認は未実施。
- 含意: dev Worker はデプロイされているが、**HTTP 経由の外形監視はまだ誰も行っていない**。実装 PR の dev 検証時に (a) workers.dev URL を確認して `WORKER_API_BASE_URL` を設定する、または (b) `wrangler tail` + 直接リクエストで確認する。

## 代替確認（実施済み）

| 確認 | 結果 |
|------|------|
| deployment が active（100%）| ✅ `wrangler deployments list --env dev` |
| アカウント・リソース整合 | ✅ R2 バケット・Worker とも正アカウントに存在 |

## 残作業（ヘルス面）

1. workers.dev URL（または将来の custom domain）確定 → `WORKER_API_BASE_URL` リポジトリ変数設定 → CI health-poll 有効化。
2. 実装 PR 時: `/api/health` の `runtime: "cloudflare-workers"` を手動確認（FR-6.2 / RL-5 帰属どおり）。
