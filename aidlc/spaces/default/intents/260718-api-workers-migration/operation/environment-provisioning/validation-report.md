# Validation Report — api-worker 環境検証 (2026-07-18)

前提: environment-inventory.md の棚卸しと deployment-pipeline/cd-config.md のアクセス経路を実測で検証した結果。infrastructure-design/deployment-architecture.md・infrastructure-services.md の宣言と突き合わせる。

## 実測結果（本日実施、読み取り操作のみ）

| 検証 | 方法 | 結果 |
|------|------|------|
| ローカル wrangler 認証 | `wrangler whoami` | ✅ `saedgewell@gmail.com`（account `175c04a4…`）OAuth |
| アカウントが zedi アカウントであること | `wrangler r2 bucket list` に既知リソース | ✅ `zedi-storage-dev` / `zedi-storage-prod` 存在（2026-06-29 作成） |
| dev Worker 存在・稼働 | `wrangler deployments list --env dev` | ✅ `zedi-api-dev` に本日 2026-07-18T00:56 の deployment（Upload + Secret Change、author saedgewell@gmail.com） |
| CI デプロイ経路 | `gh run list`（deploy-api-worker-dev.yml 直近 3 件） | ❌ **全て failure**（最新 2026-07-18T01:44、develop）— `CLOUDFLARE_API_TOKEN` 要修復のまま |
| Cloudflare MCP | セッション接続状態 | ❌ 未認証（claude.ai connector 側で要認可） |

## 判定

- **ローカル経路の資格情報ブロッカー（C-2 の前半）は解消済み。** 実装後の dev デプロイ・手動検証（FR-6.2、`wrangler tail`）はローカル wrangler で実施可能。
- **CI 経路（C-2 の後半）は未解消。** `deploy-api-worker-dev.yml` は起動するがデプロイ失敗が継続。GitHub secret `CLOUDFLARE_API_TOKEN` のローテーション（token-scopes.md のスコープで再発行）が必要 — 本ワークフローのコード実装とは独立に対応可能。
- 新規プロビジョニングは不要（インベントリどおり全リソース既存）。`RUNTIME` var と `SENTRY_DSN_API` secret は実装 PR / secret 投入時に追加する（環境作成ではなく構成追記）。

## 残作業（環境面）

1. GitHub secret `CLOUDFLARE_API_TOKEN` の再発行・更新（アカウント `175c04a4…` に対して）。
2. 更新後、develop push で deploy-api-worker-dev.yml が green になることの確認。
