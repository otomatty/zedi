# CI Config — api-worker (#1091)

前提: infrastructure-design/cicd-pipeline.md の設計を具体的なワークフロー変更に落とす。code-generation の code-summary.md / build-and-test 成果物は infra スコープにより不在（expected）— 実装 PR 時にこの設計を適用する。

## 変更対象と内容

### `ci.yml`（品質ゲート — 追加のみ、既存ジョブ不変）

- `api-typecheck` ジョブ（L265 付近）に 1 ステップ追加: `bun run worker:bundle:check`（LC-5 dry-run 検査。資格情報不要のため PR でも実行可能）。
- `api-test` ジョブ（L289 付近）に 1 ステップ追加: `bun run test:worker`（workerd テスト。vitest-pool-workers 互換が取れない場合のフォールバックは code 実装時に確定 — LC-6）。

### `deploy-api-worker-dev.yml`（デプロイ — ステップ追加のみ）

- `wrangler deploy --env dev` の**直前**に `bun run worker:bundle:check` ステップを追加（ci.yml と並列起動のため、デプロイ前実行の機械保証はここ。cicd-pipeline.md の設計どおり）。
- health-poll・トリガ・paths フィルタは不変。

### `server/api/package.json`（scripts 追加）

- `worker:bundle:check`: dry-run バンドル検査スクリプトの起動。
- `test:worker`: workerd テスト実行（`vitest run -c vitest.config.worker.ts` 相当）。

## 変更しないもの

- prod 用デプロイワークフロー（作らない — Q8=B）。
- `mutation-light` / `nightly-mutation`（server/api は Stryker 対象外 — team-practices）。
- drizzle 系チェック（DB スキーマ変更なし — C-4）。
- Terraform 系ワークフロー（凍結 — C-3）。
