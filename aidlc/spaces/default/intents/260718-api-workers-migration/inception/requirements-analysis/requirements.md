# Requirements — Issue #1091: REST API (server/api, Hono) → Cloudflare Workers

## Intent Analysis

Railway → Cloudflare 全面移行（Epic #1088、Phase 2）の一環として、`server/api`（Hono REST API）を Cloudflare Workers で実行可能にする。Phase 2a で Worker 骨格（`src/worker.ts`、`wrangler.jsonc`、R2/DO binding、dev deploy CI）は導入済みであり、本 Issue の目的は**残る Node 依存を解消し、Worker ランタイムに適合した API を dev 環境で検証可能にすること**。ゴールは「本番切替」ではなく「切替可能な状態」——DB 層は #1090（D1 ビッグバン移行）、LangGraph は #1095（Workflows/Queues 化）にそれぞれ委譲し、本 Issue はその境界を明確に切る。

回答セット（`requirements-analysis-questions.md`、Q1-Q8）と practices-discovery の `team-practices.md`（TDD 必守、Walking Skeleton 常時実施、Mutation 第一指標、develop→dev 自動デプロイ）を前提とする。

## Functional Requirements

### FR-1. LangGraph ルート分割（Q3=A）

- FR-1.1: `createApp()` にオプション（例: `{ includeAgentRoutes: boolean }`）を導入し、compose/agent 系ルート（compose-sessions、`/api/ingest` 等の LangGraph 依存経路）と agent graph 登録を条件化する。
- FR-1.2: `src/worker.ts` は agent ルート**無効**で app を生成し、`@langchain/langgraph` および `src/agents/**` が Worker バンドルに含まれないことを保証する。検証手段: `wrangler deploy --dry-run --outdir` のバンドル出力に対する内容検査（`@langchain/langgraph` / `src/agents` 由来コードの不在チェック）を再実行可能なスクリプトまたはテストとして残す。
- FR-1.3: `src/index.ts`（Node/Railway）は現行どおり全ルートを登録し、挙動が変わらないこと。
- FR-1.4: Worker 側で分割対象パスへのリクエストは 404（未登録）となる。501 スタブは作らない。

### FR-2. clientIp の Workers 対応（Q5=A）

- FR-2.1: Workers ランタイムでは `cf-connecting-ip` ヘッダを第一候補として clientIp を解決する。
- FR-2.2: Node ランタイムでは既存の TRUST_PROXY / x-forwarded-for / conninfo フォールバック挙動を維持する。
- FR-2.3: Node 専用 import（`@hono/node-server/conninfo`）が Worker バンドル・実行経路に入らないこと。
- FR-2.4: clientIp の全利用箇所が両ランタイムで正しい IP を受け取る。利用箇所の全数列挙（レート制限ミドルウェア等）は Functional Design の成果物として確定する（OQ-5）。

### FR-3. Sentry の Workers 対応（Q4=A）

- FR-3.1: `@sentry/cloudflare` を導入し、worker エントリでエラー捕捉を初期化する。
- FR-3.2: Node 側は `@sentry/node` を現状維持。`captureApiException` 等の共有呼び出し面は両 SDK で動作する抽象を保つ。
- FR-3.3: Sentry DSN 未設定時は両ランタイムで no-op（現行挙動踏襲）。

### FR-4. presigned URL 経路の Workers 動作確認（Q6=A）

- FR-4.1: `@aws-sdk/client-s3` + `s3-request-presigner` による presign 生成が `nodejs_compat` 下の workerd で動作することをテストで確認する（コード変更は不具合時のみ最小限）。

### FR-5. Worker ランタイムテスト（Q7=A）

- FR-5.1: `@cloudflare/vitest-pool-workers`（または同等の workerd 実行基盤）を server/api に導入する。
- FR-5.2: Worker エントリを対象に、非 DB 経路（/api/health、CORS、clientIp、ルート分割の登録有無、KV DO レート制限、storage/R2、presign、**auth ハンドラのマウント・起動**）の workerd 実行テストを TDD で作成する。auth については `/api/auth/*` ルートが workerd 上で Worker ランタイム例外を出さずに整形済みレスポンスを返すことまでを確認し、DB 到達を要する成功系はスタブ境界（FR-5.3）で扱う。
- FR-5.3: DB 依存経路はスタブ境界（drizzle クライアント境界等）で扱い、DB 実接続を要するアサーションは #1090 後の検証に委ねる。
- FR-5.4: テスト配置は `server/api/src/__tests__/` ミラー規則に従う（team-practices.md の配置規則）。

### FR-6. dev デプロイでの検証（Q1=A / Q8=B）

- FR-6.1: 既存 `deploy-api-worker-dev.yml`（develop push → `wrangler deploy --env dev`）が本変更後も health-poll を通過する。
- FR-6.2: dev Worker 上で非 DB 経路（/api/health のランタイム判定、CORS プリフライト、レート制限の KV DO 動作、auth エンドポイントが Worker ランタイムエラーなく応答すること）が確認できる。auth の DB 依存成功系（サインイン/セッション確立）の dev 検証は #1090 後。

## Non-Functional Requirements

- NFR-1 **バンドル**: Worker バンドルは gzip 後 10 MB（Workers 有料プラン上限。無料プランは 3 MB）以内に収まり、LangGraph 系依存を含まない。上限値は設計時に最新の Cloudflare ドキュメントで再確認する。
- NFR-2 **互換性**: Node（Railway）側の全既存テストが green のまま（並行稼働の維持）。
- NFR-3 **セキュリティ**: 5xx マスキング（`{ error: string }` 封筒）、secrets の `wrangler secret bulk` 管理、`.env.worker.*` 非コミットを維持。clientIp の偽装耐性は Workers では CF 保証ヘッダで担保。
- NFR-4 **テスト品質**: TDD（Red→Green→Refactor）。server/api は Stryker 対象外のため、coverage + アサーション強度で担保（team-practices.md の Testing Posture）。

## Constraints

- C-1: `server/api` は root workspace 外（サービス単位 `bun.lock`）。依存追加は `server/api` 内で完結させる。
- C-2: ローカル wrangler は現在**別アカウント**にログイン中、CI の Cloudflare トークンも要修復。資格情報が必要な操作（実 dev デプロイ検証）はブロックされ得るため、DoD の実機確認は資格情報復旧後に実施可能な形にする（ローカルは `wrangler dev` / workerd テストで代替）。
- C-3: 構成の正本は `server/api/wrangler.jsonc`。Terraform には触れない（凍結中）。
- C-4: DB スキーマ変更は行わない（drizzle 移行ルールの対象外であること）。

## Assumptions

- A-1: D1 移行（#1090）がビッグバンで DB 層を置換するため、Worker からの Postgres 接続（Hyperdrive 等）は実装しない（Q2=X）。本 Issue 完了時点で dev Worker の DB 依存経路は未検証のままとなる。
- A-2: 認証（Better Auth）は DB 依存のため、認証フローの dev E2E 検証も #1090 後。 本 Issue では auth ハンドラが workerd で例外なくマウント・起動できること（ランタイム適合）までを確認する。
- A-3: Railway 稼働（`src/index.ts`）は並行継続し、本 Issue で挙動変更しない。
- A-4: レート制限は KvStore 抽象（#1093/#1118 済）の `DurableObjectKvStore` で Workers 動作する前提。workerd テストで検証する。

## Out of Scope

- 本番切替（prod Worker デプロイ、DNS カットオーバー、prod デプロイワークフロー作成）— 切替判断時の別 PR（Q8=B）。
- Postgres/Hyperdrive 対応、D1 移行 — #1090。
- LangGraph の Workflows/Queues 化 — #1095（本 Issue はルート分割による境界確定まで）。
- `server/mcp` / `server/hocuspocus` の Workers 化 — #1092 / #1094。
- 既存オブジェクト・データの移送。

## Open Questions

- OQ-1: compose/agent 系ルートの正確な一覧（分割境界の確定）は Functional Design で `createApp()` のルート登録を精査して確定する。
- OQ-2: `@sentry/cloudflare` と Hono の統合方式（withSentry ラッパ vs ミドルウェア）は設計時に最新ドキュメントで確認する。
- OQ-3: vitest-pool-workers と既存 vitest 設定（`server/api/vitest.config.ts`）の共存構成（プロジェクト分割 or 別 config）。
- OQ-4: dev 実機検証のタイミング — Cloudflare 資格情報（正アカウントの wrangler ログイン / CI トークン）の復旧に依存。
- OQ-5: clientIp 利用箇所の全数列挙（FR-2.4）— Functional Design で確定する。

## Review

**Verdict**: READY
**Reviewer**: aidlc-product-lead-agent
**Date**: 2026-07-18

### Findings

（iteration 2 再レビュー。iteration 1 の指摘 1 major / 3 minor は全て解消を確認。blocker / major なし。）

- **[resolved: major] 認証のランタイム適合確認の FR 昇格。** FR-5.2 に workerd テスト対象として auth ハンドラのマウント・起動と `/api/auth/*` の整形済みレスポンス確認（DB 到達成功系は FR-5.3 スタブ境界）、FR-6.2 に dev 検証項目として「auth エンドポイントが Worker ランタイムエラーなく応答」+ DB 依存成功系の #1090 送りが明記された。A-2 と矛盾なし、精緻化 Q1 回答（ランタイム適合 + 非 DB 経路 dev 検証）と一致。dev Worker 上で DB 到達時に NFR-3 の `{ error: string }` 封筒 5xx が返るケースも「ランタイム例外なく応答」の判定基準として整合。
- **[resolved: minor] FR-1.2 バンドル検証手段。** `wrangler deploy --dry-run --outdir` 出力の内容検査を再実行可能なスクリプト/テストとして残すと明記。dry-run は Cloudflare 資格情報を要さないため C-2（資格情報ブロック）とも矛盾しない。
- **[resolved: minor] NFR-1 サイズ上限。** gzip 後 10 MB（有料プラン。無料 3 MB）と明記、設計時のドキュメント再確認注記付き。数値は現行 Cloudflare 制限と一致。
- **[resolved: minor] FR-2.4 利用箇所列挙。** OQ-5 新設で Functional Design の成果物として明示。
- **[note] 新規不整合なし。** 改訂は FR-1.2 / FR-2.4 / FR-5.2 / FR-6.2 / NFR-1 / OQ-5 に限定され、Q1〜Q8 回答との忠実性・Out of Scope 境界・team-practices.md（TDD / ミラー配置 / Stryker 対象外）との整合は iteration 1 検証時から不変。Step 10 必須 7 セクション全て存在。参照リポジトリ事実（worker.ts / app.ts / clientIp.ts / wrangler.jsonc / deploy-api-worker-dev.yml / DurableObjectKvStore / captureApiException / `src/__tests__/` ミラー / `db/client.ts` lazy 初期化）は iteration 1 で実在確認済み。
