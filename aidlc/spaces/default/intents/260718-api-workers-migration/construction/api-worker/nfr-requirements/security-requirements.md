# Security Requirements — api-worker

前提: business-logic-model.md / business-rules.md は infra スコープにより未作成。requirements.md の NFR-3・FR-2 と既存実装のセキュリティ態勢（practices-discovery evidence）から導出する。

## 認証・認可

- SR-1: Better Auth の Cookie ベース認証・CSRF 保護は共有 `createApp()` 経由で Worker でも同一構成でマウントされること（FR-5.2 のランタイム適合確認まで。DB 依存成功系は #1090 後）。
- SR-2: `BETTER_AUTH_SECRET` は API/MCP 間で同値共有（既存制約）。Worker への供給は `wrangler secret bulk` のみ。

## データ保護・エラーマスキング

- SR-3: 5xx はグローバル `onError` の `{ error: string }` 封筒で内部情報（DB エラー文字列等）を漏らさない（NFR-3、既存挙動維持）。
- SR-4: secrets はリポジトリ非コミット（`.env.worker.*` は gitignore、`putWorkerSecrets.ts` で `wrangler secret bulk`）。dry-run バンドル検査（FR-1.2）の出力にも secret 値が含まれないこと。

## クライアント IP・レート制限

- SR-5: Workers では `cf-connecting-ip`（Cloudflare が付与し偽装不可）を第一候補とし、x-forwarded-for 偽装によるレート制限回避を防ぐ（FR-2）。
- SR-6: レート制限カウンタ・ワンタイムコード・deny-list は KvStore 抽象（DurableObjectKvStore）で Worker 上も機能すること（A-4、workerd テスト対象）。

## CORS

- SR-7: CORS 設定（`src/lib/cors.ts`）は両ランタイムで同一の許可オリジンを返すこと。Worker 化による許可先の拡張はしない。
