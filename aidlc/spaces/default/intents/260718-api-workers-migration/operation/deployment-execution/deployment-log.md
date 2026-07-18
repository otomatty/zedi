# Deployment Log — api-worker (#1091) 2026-07-18

前提: deployment-pipeline/cd-config.md・deployment-strategy.md の手順に対する実行記録。environment-provisioning/environment-inventory.md のアクセス経路で実測。

## 本ステージでの新規デプロイ: 実行せず（意図的）

#1091 の実装コード（ルート分割・clientIp・withSentry 等）は未着手のため、いまデプロイしても Phase 2a 骨格の再デプロイにしかならない。**実装 PR がマージされる develop push が本番の実行タイミング**であり、その時点で cd-config.md のパイプライン（bundle check → deploy → health-poll）が適用される。

## 既存デプロイの実測記録（読み取りのみ）

| 項目 | 値 |
|------|-----|
| Worker | `zedi-api-dev`（account `175c04a4…`） |
| 最新 deployment | 2026-07-18T00:56:22Z Upload（version `28fefd1d…`、100%）+ 00:56:23Z Secret Change（version `82574367…`） |
| 実行者 | saedgewell@gmail.com（ローカル wrangler、手動） |
| CI 経由デプロイ | ❌ 直近 3 run 全て failure（`CLOUDFLARE_API_TOKEN` 未修復 — validation-report.md） |

## 実装 PR 時の実行手順（再掲・確定）

1. `bun run worker:bundle:check`（ローカル/CI とも。禁止依存の不在）
2. `wrangler deploy --env dev`（CI トークン修復前はローカル実行で代替可 — 資格情報は検証済み）
3. health-poll + 手動 dev 検証（deployment-strategy.md の成功 4 条件）
