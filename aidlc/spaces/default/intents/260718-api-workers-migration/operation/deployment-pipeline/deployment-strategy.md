# Deployment Strategy — api-worker (#1091)

前提: cd-config.md のパイプラインが従う戦略。deployment-architecture.md（unit: api-worker）の並行稼働トポロジを踏襲。

## 戦略: 並行稼働 + 全量置換（dev）

- dev Worker は **recreate（全量置換）**: `wrangler deploy --env dev` は新バージョンへ即時切替。dev は検証専用でユーザートラフィックが無いため、canary / gradual rollout は不要。
- 本番トラフィックは Railway が担い続ける（A-3）。本 Issue に本番デプロイ戦略は存在しない — prod 切替 PR（Out of Scope）で blue-green / gradual（`wrangler versions deploy`）を設計する。

## デプロイ成功の定義

1. bundle check green（禁止依存の不在）。
2. `wrangler deploy --env dev` 成功。
3. health-poll HTTP 成功（CI 自動）。
4. 手動 dev 検証（資格情報復旧後）: `runtime: "cloudflare-workers"`、非 DB 経路の応答、auth エンドポイントのランタイムエラー無し、CPU 超過エラー無し（FR-6.2 / PR-4）。
