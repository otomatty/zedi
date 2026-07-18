# Tech Stack Decisions — api-worker

前提: business-logic-model.md / business-rules.md は infra スコープにより未作成。requirements.md の Q&A 確定事項を技術選定として固定する。

## 決定事項

| # | 領域 | 決定 | 根拠 |
|---|------|------|------|
| TS-1 | ランタイム | Cloudflare Workers（`nodejs_compat`）、Paid プラン | Q1=A。wrangler.jsonc が構成の正本（C-3） |
| TS-2 | フレームワーク | Hono（既存共有 `createApp()` を維持、`includeAgentRoutes` 相当のオプション追加のみ） | FR-1。Workers ネイティブ対応 |
| TS-3 | DB 接続 | **導入しない**（Hyperdrive/HTTP ドライバとも不採用）。D1 へ直行（#1090） | Q2=X（requirements）。二度手間の暫定実装を避ける |
| TS-4 | KV/レート制限 | KvStore 抽象 + `DurableObjectKvStore`（導入済み #1093/#1118） | A-4。追加選定不要 |
| TS-5 | ストレージ | R2 binding + `@aws-sdk` presign 維持（動作確認のみ） | Q6=A。変更最小 |
| TS-6 | エラー監視 | `@sentry/cloudflare`（Worker）+ `@sentry/node`（Railway、現状維持） | Q4=A。FR-3 |
| TS-7 | クライアント IP | `cf-connecting-ip` 第一候補の分岐を `src/lib/clientIp.ts` に追加 | Q5=A。FR-2 |
| TS-8 | テスト基盤 | `@cloudflare/vitest-pool-workers`（workerd 実行）を既存 vitest と併存構成で導入 | Q7=A。FR-5、OQ-3 |
| TS-9 | CI/CD | 既存 `deploy-api-worker-dev.yml` 維持。prod ワークフローは作らない | Q8=B |

## 実装時の確定事項（2026-07-18 追記）

- TS-8 確定: `@cloudflare/vitest-pool-workers@0.18.6` は vitest ^4.1.0 対応で互換リスク解消。フォールバック不要。vitest 4 向けの `cloudflareTest` プラグイン API（`vitest.config.worker.ts`）で導入。
- 境界の追加確定（設計原則の適用拡張）: `ioredis` は `createKvStoreNode.ts`、`jsdom` は遅延 import 化により Worker のモジュールロードから除外。`worker:bundle:check` の禁止マーカーは 5 件（@langchain / src/agents / @hono/node-server / @sentry/node / ioredis）。

## 却下した選択肢

- Hyperdrive + pg / neon serverless: D1 ビッグバン移行（#1090）で捨てる暫定層になるため不採用（TS-3）。
- LangGraph の Worker 同梱（フラグ無効化・専用 Worker 化含む）: バンドル上限・workerd 互換リスク・#1095 との重複のため不採用。ルート分割（FR-1）を採用。
- `aws4fetch` への presign 置換: 動作すれば不要な書き換え。動作確認で問題が出た場合のみ再検討（TS-5）。

## Review

**Verdict**: READY
**Reviewer**: aidlc-architecture-reviewer-agent
**Date**: 2026-07-18

### Findings

（アドバーサリアル・レビュー。5 成果物 + Q&A + requirements.md を対象に、リポジトリ実体との照合を実施。blocker / major なし。）

- **[minor] RL-5 が health-poll の検証内容を過大に記述。** `deploy-api-worker-dev.yml`（L51-59）の実体は `curl --fail` による HTTP 成功判定のみで、レスポンス中の `runtime` フィールド（ランタイム判定）はアサートしない。また同ステップは `vars.WORKER_API_BASE_URL` 未設定時にスキップされる（`if:` ガード）。RL-5 の「200 + ランタイム判定をデプロイ成功条件として維持」は、ランタイム判定部分を FR-6.2 の手動 dev 検証（PR-5 は正しく HTTP 通過のみと記述）と区別して読む必要がある。nfr-design で判定基準の帰属（CI 自動 vs 手動検証）を 1 行明確化すれば足りる。
- **[minor] PR-1「体感パリティ」の判定手続きが未定義。** Q2=A（数値目標なし）への忠実な反映であり方針としては正当だが、dev 実機での「パリティ確認（手動）」（PR-6）は誰が・どの経路で判定するかが書かれておらず、C-2（資格情報ブロック）解消まで実施もできない。requirements.md 自体が DoD 実機確認の後日実施を認めているため blocker ではないが、検証チェックリスト化は build-and-test 段階で必要。
- **[minor] PR-4「残る経路に CPU 制限の懸念はない」は無根拠の断定。** LangGraph 除外（FR-1）後の残経路（presign、検索等）の CPU プロファイルは未計測。Paid プラン既定値が十分広いため実害リスクは低いが、「懸念はない」ではなく「dev 検証で CPU 超過エラー（exceeded CPU）が観測されないことを確認する」と検証可能な形が望ましい。
- **[verified] リポジトリ実体との照合はすべて一致。** `server/api/src/lib/clientIp.ts`（現状 Node 専用、TS-7 の「追加」記述と整合）、`server/api/src/lib/cors.ts`、`server/api/src/lib/kv/doKvStore.ts`（`idFromName(key)` による論理キー毎 DO — SC-2 の記述と一致）、`server/api/scripts/putWorkerSecrets.ts`、ルート `.gitignore` L27-28（`.env.worker.*` 非コミット — SR-4 と一致）、`server/api/src/middleware/errorHandler.ts` L21（`{ error: err.message }` 封筒 — SR-3/RL-3 と一致）、`server/api/src/routes/health.ts` の `runtime` フィールド、`.github/workflows/deploy-api-worker-dev.yml` を確認。
- **[verified] Q&A 忠実性・スコープ整合。** Q1=Paid → PR-3 gzip 10MB / TS-1 と一致。Q2=パリティ → 全 5 成果物に数値レイテンシ目標なし、RL-1 の SLA/SLO 不設定・SC-3 の負荷検証送りとも矛盾なし。TS-3（DB 不導入）= A-1/Q2=X、TS-9（prod ワークフロー不作成）= Q8=B/Out of Scope と一致。スコープの拡大・縮小なし。全成果物が requirements / business-logic-model / business-rules への参照（infra スコープによる不在の明示含む）を持ち、H2 見出し 2 以上の必須構成を満たす。5 成果物間の予算・主張の矛盾なし。
