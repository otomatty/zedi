# Logical Components — api-worker

前提: business-logic-model.md は infra スコープにより未作成（functional-design スキップ）。本設計は nfr-requirements 5 成果物（performance/security/scalability/reliability-requirements.md、tech-stack-decisions.md）とコード実査（file:line 付き）から導出。

## コンポーネント一覧

| ID | コンポーネント | 変更 | 対応要件 |
|----|--------------|------|---------|
| LC-1 | `createApp(options)` — `src/app.ts` | オプション追加 | FR-1（ルート分割） |
| LC-2 | Worker エントリ — `src/worker.ts` | agent 無効で生成 + Sentry 初期化 | FR-1, FR-3 |
| LC-3 | clientIp — `src/lib/clientIp.ts` | Workers 分岐追加 | FR-2 |
| LC-4 | エラー捕捉 DI — `src/middleware/errorHandler.ts` + 両エントリ | capture 関数の注入化 | FR-3 |
| LC-5 | バンドル検査スクリプト — `server/api/scripts/`（新規） | 新規 | FR-1.2 |
| LC-6 | workerd テスト基盤 — vitest 併存構成 | 新規 | FR-5 |

## LC-1: createApp オプション

`createApp(): Hono<AppEnv>`（`app.ts:59`、現状引数なし）に `{ includeAgentRoutes?: boolean }`（default `true`）を追加。`false` のとき以下を **登録しない**:

- graph 登録 5 件（`app.ts:69-73`: stub / researchLoop / wikiCompose / ingestPlanner / wikiMaintenance）
- `app.route("/api/pages", composeSessionRoutes)`（`app.ts:168`）
- `app.route("/api/ingest", ingestRoutes)`（`app.ts:192`）

境界は**モジュールレベル**で切る（静的 import のままでは bundler がフラグ値に関係なく取り込み、wrangler の esbuild 単一ファイルバンドルはローカルモジュールへの動的 import も取り込むため、実行時分岐・動的 import では除外できない）: agent 系の import（`app.ts:47`, `49-53`）・graph 登録・マウントを `src/appAgents.ts` に分離し、`createApp` は登録フック `registerAgentRoutes?: (app: Hono<AppEnv>) => void` を受け取る。`index.ts` だけが `appAgents.ts` を import してフックを渡し、`worker.ts` は渡さない。

除外の完全性根拠: `../agents` / `@langchain` を参照する routes/** は `composeSessions.ts`（+ `composeSessionProjection.ts`, `composeSessionRunLocale.ts`）と `ingest.ts` の 4 ファイルのみ（grep 検証済み）。

## LC-2: worker.ts

`const app = createApp()` (`worker.ts:13`) → agent フックなし（LC-1）+ capture DI（LC-4）で生成し、default export を `@sentry/cloudflare` の **`withSentry(env => ({...}), app)` ラッパ**で包む（OQ-2 の決定 — 下記 LC-4）。`KvDurableObject` re-export（`worker.ts:11`）は維持（`withSentry` は fetch handler をラップするのみで、named export の DO クラスに影響しない）。

## LC-3: clientIp

`extractClientIp(c)`（`clientIp.ts:81`）に Workers 分岐: **ランタイムが Workers のとき** `CF-Connecting-IP` ヘッダを第一候補にする。ランタイム判定はヘッダ存在ではなく binding/明示 var で行う（Node 環境で攻撃者が同名ヘッダを送る偽装を防ぐ。SR-5）。判定手段は `health.ts` の既存パターン（R2 binding 存在）と同型の明示的シグナルとし、実装時に `RUNTIME` var（wrangler.jsonc `[vars]`）を推奨。Node 側フォールバック順（`x-forwarded-for` → `x-real-ip` → socket、`clientIp.ts:83-88`）は不変。

**conninfo のバンドル除外機構**（FR-2.3、LC-1 と同じモジュールレベル境界）: `@hono/node-server/conninfo` への静的 import（`clientIp.ts:18`）を新規 `src/lib/clientIpNode.ts` に移し、socket フォールバックを**注入可能な resolver** にする。`clientIp.ts` はヘッダ解決 + 注入された resolver 呼び出しのみのランタイム中立モジュールになり、`index.ts` だけが `clientIpNode.ts` を import して resolver を配線する（`worker.ts` は配線しない → socket フォールバックは Workers では単に無し）。共有利用箇所（`rateLimit.ts:93` / `auditLog.ts:81` / `inviteLinks.ts:155`）は `extractClientIp` を呼ぶだけで変更不要のまま、Worker バンドルから `@hono/node-server` が消え、LC-5 の不在検査と整合する。

利用箇所（OQ-5 の確定、全 3 箇所 + テスト）: `middleware/rateLimit.ts:93`、`services/auditLog.ts:81`（re-export `:54-55`）、`routes/inviteLinks.ts:155`。

## LC-4: エラー捕捉 DI

現状 `errorHandler.ts:4` が `lib/sentry.ts`（@sentry/node）を静的 import — このままでは Worker バンドルに @sentry/node が入る。設計: `createApp(options)` に `captureException?: (err, status, ctx) => void`（+ `shouldCapture` 相当）を注入し、errorHandler はコンテキスト経由で受け取る。errorHandler が要求する DI サーフェスは `captureApiException(err,status,{method,routePath})` + `shouldCaptureApiException(status)` の 2 点（`errorHandler.ts:15-16,38-39` の現利用面）。

- **Node 側**（`index.ts`）: 既存 `lib/sentry.ts` の実装をそのまま注入。`initSentry()`（`index.ts:5`）も現状維持。
- **Workers 側**（`worker.ts`）: **`withSentry` ラッパ方式を採用**（OQ-2 の解）。`@sentry/cloudflare` の `withSentry(env => ({ dsn: env.SENTRY_DSN_API, sendDefaultPii: false, denyUrls, beforeSend: scrubSentryEvent }), app)` で default export を包む。ラッパが SDK 初期化と `ctx.waitUntil` によるイベント flush を保証するため（素の captureException ではリクエスト終端で flush されず欠落し得る — RL-4 の捕捉保証）、Workers 側に `initSentry` は**作らない**。新規 `lib/sentryWorker.ts` は capture DI（`Sentry.captureException` + 共有 `shouldCaptureApiException`）と `withSentry` オプション生成のみを持つ。
- スクラブ挙動（`sendDefaultPii:false`、`denyUrls`、`beforeSend`/`scrubSentryEvent`）は両ランタイム同一とする（FR-3.2）。`scrubSentryEvent`（`sentry.ts:99`）と `shouldCaptureApiException`（`:83`）は SDK 非依存の純関数なのでランタイム中立モジュールへ抽出して共有する。DSN 未設定時 no-op（FR-3.3）。

## LC-5: バンドル検査

新規スクリプト（`scripts/` 配下、`worker:bundle:check` npm script）: `wrangler deploy --dry-run --outdir <tmp>` の出力を検査し、`@langchain` / `src/agents` 由来コードと `@hono/node-server` / `@sentry/node` の**不在**を fail-fast で確認。資格情報不要（dry-run）なので C-2 制約下でも CI 実行可能。

## LC-6: workerd テスト基盤

`@cloudflare/vitest-pool-workers` を別 config（例: `vitest.config.worker.ts` + `test:worker` script、include: `src/__tests__/worker/**`）で併存導入（OQ-3 の解: 既存 `vitest.config.ts` は不変のまま分離）。workerd テスト対象（FR-5.2 + SR-6 + TS-5 の全数）: /api/health、CORS プリフライト、clientIp 分岐、ルート分割の登録有無、auth マウント、エラーマスキング、KvStore 3 用途（`incrWithTtl` レート制限カウンタ / `getdel` ワンタイムコード原子消費 / `get`+`setex` deny-list）、storage/R2 + `@aws-sdk` presign 生成（TS-5/FR-4 の検証の置き場はここ）。**互換リスク**: 現行 vitest は 4.1.10 で、pool-workers の対応 vitest レンジは導入時に最新ドキュメントで要確認。非対応の場合のフォールバック: worker テスト専用にサポート対象 vitest をローカル devDependency として分離するか、`wrangler dev` + fetch ベースの統合テストに切替（判断は code-generation で行い、採用した側を tech-stack-decisions に追記する）。

## Review

**Verdict**: READY
**Reviewer**: aidlc-architecture-reviewer-agent
**Date**: 2026-07-18

### Findings

（iteration 2 再レビュー。iteration 1 の 3 major / 3 minor は全て解消をリポジトリ実体との照合で確認。blocker / major なし。）

- **[resolved: major] LC-3 conninfo バンドル除外機構。** `@hono/node-server/conninfo` の静的 import（`clientIp.ts:18`）を新規 `clientIpNode.ts` へ移し、socket フォールバックを注入 resolver 化、`clientIp.ts` をランタイム中立にして `index.ts` のみが配線する設計が明記された。LC-1 と同一のモジュールレベル境界原則で、共有利用 3 箇所（`rateLimit.ts:93` / `auditLog.ts:81` / `inviteLinks.ts:155`）は無変更のまま Worker バンドルから `@hono/node-server` が消える — FR-2.3 と LC-5 の不在検査に整合。
- **[resolved: major] OQ-2 決定。** `withSentry(env => ({...}), app)` ラッパ採用が LC-2/LC-4 に明記され、Workers 側 `initSentry` の不作成、`ctx.waitUntil` による flush 保証（RL-4）、DO named export への非影響（`worker.ts:11` — withSentry は fetch handler のみラップ）まで記述。`scrubSentryEvent`（`sentry.ts:99`）/ `shouldCaptureApiException`（`:83`）の純関数抽出・共有も両者の実体（SDK 非依存ロジック）と一致。DI サーフェスの `errorHandler.ts:15-16,38-39` への絞り込みは現利用面と正確に一致（実線確認済み）。ゼロ質問根拠（OQ-2 を本ステージで解決）と成果物の不整合は解消。
- **[resolved: major] SR-6 全 3 対象の収載。** security-design 新設 SR-6 節・scalability-design SC-2 節・LC-6 対象一覧の 3 箇所が同一の 3 対象を列挙し相互整合。挙げられた各用途はコード実体と一致: `incrWithTtl`（`rateLimit.ts:117`、invite/inviteLinks）、`getdel` ワンタイムコード原子消費（`mcpAuth.ts:94`、`extAuth.ts:60`）、`get`/`setex` MCP 失効 deny-list（`mcpAuth.ts:235`）。全 op は KvStore インターフェース（`lib/kv/types.ts:17,23,32`）と `DurableObjectKvStore`（`doKvStore.ts:23,28,34`）に実在。
- **[resolved: minor] LC-1 の動的 import 代替案は削除され、モジュールレベル境界（`appAgents.ts` 分離 + `registerAgentRoutes` フック、`index.ts` のみが import）が唯一の機構となった。wrangler の esbuild 単一ファイルバンドルが動的 import も取り込むという根拠も正しく記載。
- **[resolved: minor] TS-5/FR-4 の presign 検証は LC-6 の workerd テスト対象一覧に収載（「検証の置き場はここ」と明示）。FR-5.2 の全対象 + SR-6 + TS-5 で一覧は網羅的。
- **[resolved: minor] 虚偽引用 `pdfSources.ts:14` は削除され、除外集合の根拠は grep 実結果（4 ファイルのみ）の記述に修正された — 再検証と一致。
- **[verified] 新規の不整合なし。** performance-design / reliability-design は不変のまま LC-1〜6 改訂と矛盾しない（PR-3 の「モジュールレベル境界」参照・RL-4 の @sentry/cloudflare 捕捉は改訂後の withSentry 設計とそのまま整合）。iteration 1 で確認済みの file:line 主張（app.ts :47/:49-53/:69-73/:168/:192、clientIp.ts :18/:28/:81/:83-88、errorHandler.ts :4/:21、sentry.ts :50-52/:57-59/:83/:99、worker.ts :11/:13、vitest 4.1.10 + pool-workers 未導入、health.ts :22-27、deploy-api-worker-dev.yml :51-59）は改訂後も全て有効。SR-5 の明示的ランタイムシグナルによる `CF-Connecting-IP` 信頼ゲート（ヘッダ存在判定の禁止）も不変で健全。
- **[verified] 要件トレーサビリティ充足。** PR-1〜6 / SR-1〜7 / SC-1〜4 / RL-1〜5 / TS-1〜9 の全てが設計要素への対応または理由付き deferral（SC-3/4、PR-2、RL-2 等）を持つ。OQ-1/OQ-2/OQ-3/OQ-5 は LC-1/LC-4/LC-6/LC-3 でコード事実により解決、OQ-4（資格情報復旧待ち）は C-2 整合の deferral として妥当。開発者が設計者への追加質問なしに実装可能な水準に達している。
