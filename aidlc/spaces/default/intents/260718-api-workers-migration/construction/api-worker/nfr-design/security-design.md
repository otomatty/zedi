# Security Design — api-worker

前提: security-requirements.md（SR-1〜7）を実現する設計。business-logic-model.md は infra スコープにより未作成。

## 認証境界（SR-1, SR-2）

- Better Auth のマウント（共有 `createApp()` 内）は無変更。Worker 化で構成差を作らない。
- `BETTER_AUTH_SECRET` は `wrangler secret bulk`（`putWorkerSecrets.ts`）供給のみ。コード・設定ファイルに値を置かない。
- workerd テストで `/api/auth/*` がランタイム例外なく整形済みレスポンス（DB 未接続時はマスク済み 5xx を含む）を返すことを確認（FR-5.2）。

## クライアント IP の信頼設計（SR-5）

- `CF-Connecting-IP` は **Workers ランタイムと確定した場合のみ**信頼する（logical-components.md LC-3）。判定は明示的シグナル（binding / `RUNTIME` var）で行い、ヘッダ存在による判定はしない — Node/Railway 経路で攻撃者が `CF-Connecting-IP` を自称してレート制限キーを偽装する攻撃を排除する。
- Node 側の TRUST_PROXY セマンティクス（`clientIp.ts:28`）は不変。

## エラーマスキング・Sentry（SR-3, SR-4）

- `{ error: string }` 封筒（`errorHandler.ts:21`）と 5xx マスキングは両ランタイム共通の errorHandler をそのまま使う。
- Sentry capture の DI 化（LC-4）でも スクラブ挙動（`scrubSentryEvent`、`sendDefaultPii: false`、`beforeSend`）を `@sentry/cloudflare` 側に同一実装する。PII をイベントに含めない基準は現行 `sentry.ts:99` を正とする。
- バンドル検査（LC-5）で secret 値の混入がないことも grep 対象に含める。

## KvStore セキュリティ用途の検証（SR-6）

- SR-6 の 3 対象 — レート制限カウンタ（`incrWithTtl`）、ext/MCP ワンタイムコード（`getdel` 原子消費）、MCP 失効 deny-list（`get`/`setex`）— を workerd テスト対象に全数含める（logical-components.md LC-6 の対象一覧に収載）。

## CORS（SR-7）

- `src/lib/cors.ts` は runtime-agnostic のため無変更。workerd テストでプリフライトの許可オリジンが Node 実行時と同一であることをアサートする。
