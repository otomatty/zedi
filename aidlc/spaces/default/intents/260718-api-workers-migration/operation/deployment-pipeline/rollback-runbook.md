# Rollback Runbook — api-worker (#1091)

前提: cd-config.md / deployment-strategy.md の dev 専用パイプラインに対するロールバック手順。quality-gates.md のゲートを通過したデプロイのみが対象。

## 原則: ロールバック不要（RL-2）

dev Worker は検証専用でユーザー影響がゼロのため、失敗時の standing 手順は「放置して次の push で直す」。本番トラフィックは Railway（無変更）が担っており、dev Worker の障害は本番に波及しない。

## それでも戻したい場合（手動、資格情報必要）

1. `bunx wrangler rollback --env dev` — 直前バージョンへ戻す（Workers はバージョン保持済み）。
2. または直前の green コミットで `bun run worker:deploy:dev` 相当を手動実行。
3. 確認: `/api/health` の `git_commit_sha` が意図したコミットに一致すること。

## エスカレーション条件

- dev Worker の障害が R2 バケット（zedi-storage-dev）や DO データの破壊を伴う場合のみ、#1089/#1093 の担当文脈（cloudflare-zedi スキル）で個別対応する。Worker コード自体の再デプロイでは R2 / DO のデータは失われない。

## 本番ロールバック

存在しない（本番は Railway のまま — 本 Issue のスコープ外。prod 切替 PR で設計する）。
