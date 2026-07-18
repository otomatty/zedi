# Requirements Analysis — Clarifying Questions (Issue #1091)

前提（コード突合済み）: Phase 2a 実装済み — `wrangler.jsonc`（nodejs_compat, R2, DO）、`src/worker.ts` エントリ、KvStore 抽象（#1093/#1118）、storage 抽象（#1089）、`putWorkerSecrets.ts`、`/api/health` ランタイム判定、`deploy-api-worker-dev.yml`。
未着手/部分: pg ドライバ（Hyperdrive 無し）、LangGraph 未分離、Sentry は @sentry/node のみ、clientIp が Node 依存、aws-sdk presign 残存、Worker ランタイムテスト無し、prod デプロイワークフロー無し。

---

## Q1. 本 Issue の完了ライン（Definition of Done）

A. dev Worker で主要エンドポイント + 認証フローが通る（本番 DNS 切替は Phase 2b 後続に委譲）
B. 本番切替まで含む（prod Worker デプロイ + DNS カットオーバー）
C. コード実装 + ローカル `wrangler dev` 検証まで（クラウド側の検証は資格情報復旧後に別途）
D. Issue の検証チェックボックス全達成（dev での E2E + レート制限 + テスト green）
X. Other (please specify)

[Answer]: A. dev Worker で主要エンドポイント + 認証フローが通る — ただし Q2 追問により精緻化: DB 依存経路の dev 検証は #1090（D1）完了後。#1091 は Worker ランタイム適合 + 非 DB 経路の dev 検証まで (2026-07-18, mode: guided)

## Q2. Worker からの Postgres 接続方式

現状 `src/db/client.ts` は `pg.Pool` + `node-postgres` 固定。Workers では TCP 直結不可のため対応が必要。D1 移行（#1090）は Phase 4。

A. Hyperdrive binding を導入し、既存 `pg` を Hyperdrive 経由で使う（Workers 推奨構成）
B. HTTP ベースドライバ（neon serverless 等）へ切替
C. dev のみ Hyperdrive で検証し、本番 DB 接続の最終形は #1090（D1）に委ねる
D. DB 接続対応はこの Issue のスコープ外に切り出す（別 Issue 化）
X. Other (please specify)

[Answer]: X. Other — Postgres への Workers 対応（Hyperdrive 等）は不要。D1（#1090）へビッグバン移行するため、この Issue では DB 接続層に触れない。追問回答: DB 依存エンドポイントの検証は #1090 後に実施 (2026-07-18, mode: guided)

## Q3. LangGraph エージェント実行経路の分離方式（→ #1095 委譲）

現状 `createApp()` が agent graphs / compose ルートを全て登録し、worker.ts にも含まれる。

A. ルート分割 — worker エントリでは compose/agent 系ルートを登録しない（Railway 側で継続稼働、#1095 で Workflows/Queues 化）
B. Worker にも載せるが環境フラグで無効化（501 応答）
C. 分離せず Worker に含める（CPU 上限 5 分で一旦許容）
D. 専用 Worker に切り出す
X. Other (please specify)

[Answer]: A. ルート分割 — worker エントリでは compose/agent 系ルートを登録しない（議論の上、バンドル除外の確実性と #1095 との整合で A を選択） (2026-07-18, mode: guided)

## Q4. Sentry の Workers 対応

A. `@sentry/cloudflare` を導入し worker.ts で初期化（Node 側は @sentry/node 維持）
B. Workers では Sentry 無しで進め、observability は Cloudflare 側ツールで代替
C. スコープ外（別 Issue）
X. Other (please specify)

[Answer]: A. @sentry/cloudflare を導入し worker.ts で初期化（Node 側は @sentry/node 維持） (2026-07-18, mode: guided)

## Q5. clientIp / TRUST_PROXY の Workers 調整

現状 `src/lib/clientIp.ts` のフォールバックが `@hono/node-server/conninfo`（Node 専用）。

A. Workers では `cf-connecting-ip` ヘッダを第一候補にする分岐を追加
B. 既存の x-forwarded-for（TRUST_PROXY）で十分、変更不要
C. スコープ外
X. Other (please specify)

[Answer]: A. Workers では cf-connecting-ip ヘッダを第一候補にする分岐を追加 (2026-07-18, mode: guided)

## Q6. presigned URL 経路（@aws-sdk 残存）

R2 binding は導入済みだが、presign は `@aws-sdk/s3-request-presigner` のまま（S3 互換エンドポイント利用）。

A. nodejs_compat での @aws-sdk presign 動作確認をして維持（変更最小）
B. `aws4fetch` 等の Workers 軽量実装へ置換（バンドル削減）
C. presign 廃止方向（R2 binding 直接配信へ寄せる。設計は #1089/#1090 と整合確認）
X. Other (please specify)

[Answer]: A. nodejs_compat での @aws-sdk presign 動作確認をして維持（変更最小） (2026-07-18, mode: guided)

## Q7. テスト戦略（TDD 必守 / Walking Skeleton 常時実施の前提で）

A. Worker エントリを対象にしたテストを追加（`@cloudflare/vitest-pool-workers` 等で主要エンドポイント + 認証を workerd 実行）
B. 共有 `createApp()` の既存テストで担保し、Workers 固有部（KV DO / storage / clientIp 分岐）のユニットテストのみ追加
C. 既存テスト green のみで可（Worker ランタイムテストは追わない）
X. Other (please specify)

[Answer]: A. Worker エントリを対象にしたテストを追加（@cloudflare/vitest-pool-workers 等で workerd 実行。DB 依存経路はスタブ境界で扱う） (2026-07-18, mode: guided)

## Q8. prod 向けデプロイワークフローの扱い

dev 用 `deploy-api-worker-dev.yml` は存在。`worker:deploy:production` スクリプトと wrangler `production` env は定義済み。

A. この Issue で prod 用ワークフローも作成する（ただし DNS 切替はしない）
B. dev のみ（prod ワークフローは切替判断時の別 PR）
C. prod 切替まで一気にやる
X. Other (please specify)

[Answer]: B. dev のみ（prod ワークフローは切替判断時の別 PR） (2026-07-18, mode: guided)

---

## G1. Approval gate (typed turn required)

requirements.md（READY）の承認ゲート。チャットに approve / request changes / add user stories のいずれかをタイプしてください。

[Answer]: approve (typed, 2026-07-18)
