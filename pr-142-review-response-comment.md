## レビュー対応の記録

PR #142 に対する各レビュアーの指摘と、実施した対応を記録します。

---

### Gemini Code Assist への対応

| 指摘                                                           | 対応内容                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **管理者用エンドポイントのシークレット比較（タイミング攻撃）** | `server/api/src/routes/ai/admin.ts` で `headerSecret !== SYNC_SECRET` をやめ、`crypto.timingSafeEqual` と `Buffer.from()` を用いた比較に変更。長さが異なる場合は先にチェックしてから `timingSafeEqual` を呼ぶようにしました。 |
| **AIモデルフィルタのハードコード**                             | `server/api/src/services/syncAiModels.ts` で、OpenAI/Google の除外パターンを `OPENAI_TEXT_CHAT_EXCLUDE_PATTERNS` と `GOOGLE_TEXT_CHAT_EXCLUDE_PATTERNS` としてファイル先頭の定数に切り出しました。                            |

---

### GitHub Copilot への対応

| 指摘                                          | 対応内容                                                                                                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tier "pro" vs "paid" の不整合**             | API レスポンスで `tier` / `tierRequired` をクライアント向けに "paid" に統一（`server/api/src/routes/ai/models.ts`）。フロントの `normalizeToAIModel`（`src/lib/aiService.ts`）で "pro" → "paid" の正規化を追加。                       |
| **Anthropic の sortOrder 欠番**               | `syncAiModels.ts` の Anthropic ループで、ループ前に `baseSortOrder = all.length` を取得し、`sortOrder` に `baseSortOrder + i` を使用するよう修正。                                                                                     |
| **Better Auth cookie で localhost が壊れる**  | `server/api/src/auth.ts` で `NODE_ENV === "production"` のときのみ `sameSite: "none"`, `secure: true` とし、開発時は `sameSite: "lax"`, `secure: false` に切り替えるようにしました。                                                   |
| **IndexedDB onblocked を success 扱い**       | `src/lib/storageAdapter/IndexedDBStorageAdapter.ts` のメイン DB と Y.Doc DB の `deleteDatabase` で、`onblocked` 時に `reject` するよう変更。他タブで開いている場合はエラーとなり、呼び出し側で「他タブを閉じて再試行」を案内できます。 |
| **normalizeToAIModel の tier 型アサーション** | 上記 tier 統一に含めて、`raw.tierRequired` / `raw.tier_required` を "pro" or "paid" のとき "paid"、それ以外 "free" に正規化するようにしました。                                                                                        |
| **Railway CLI 表記の揺れ**                    | `docs/specs/ai-models-sync.md` の `railway variables set` を `railway variable set` に統一。                                                                                                                                           |
| **allowlist の挙動説明**                      | `ai-models-sync.md` に、allowlist 外のモデルは `isActive=false` に更新され一覧から消える旨を追記。                                                                                                                                     |
| **リセットの二重実行**                        | `GeneralSettingsForm.tsx` の `handleResetDatabase` の先頭で `isResetting` をチェックし、`AlertDialogAction` に `disabled={isResetting}` を追加。                                                                                       |
| **ハードコード日本語（モデル0件）**           | `AISettingsForm.tsx` のメッセージを `t("aiSettings.modelsEmpty")` に変更。`ja`/`en` の `aiSettings.json` に `modelsEmpty` を追加。                                                                                                     |
| **検証ドキュメントの 404 記述**               | 計画上は「マージ前の記録」として注記で対応。`ai-models-sync-verification.md` の確認日時を ISO 8601 表記に変更し、再検証時のコミット SHA 併記を促す文を追加済み。                                                                       |

---

### CodeRabbit への対応

| 指摘                                         | 対応内容                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **検証日時の曖昧さ**                         | `ai-models-sync-verification.md` の「頃」を ISO 8601 日時に変更し、再検証時はコミット SHA を併記する旨を記載。                            |
| **Root Directory 手順の矛盾**                | `ai-models-sync.md` の CLI デプロイ手順を「Root Directory は `server/api`、リポジトリルートで `railway up`（パスなし）」に統一。          |
| **railway variable(s) set 表記**             | `ai-models-sync.md` で `railway variable set` に統一（上記 Copilot 対応と共通）。                                                         |
| **polar-setup.md のコードブロック言語**      | 環境変数ブロックに `dotenv` を指定（MD040 対応）。                                                                                        |
| **A〜H 依存関係の説明**                      | `railway-next-steps.md` の「A〜H は依存関係がない」を、「B←A / D←C / F←E の依存あり。依存のないタスクは並行可」に修正。                   |
| **railway-next-steps のコードブロック言語**  | 環境変数ブロックに `dotenv`、タスク一覧ブロックに `text` を指定（MD040 対応）。                                                           |
| **production サービス名**                    | `railway-remaining-tasks.md` の Step 6 以降で、`api` / `hocuspocus` を `api-prod` / `hocuspocus-prod` に統一。                            |
| **02-transform.ts forEach の lint**          | `errors.slice(0, 10).forEach` のコールバックをブロック body に変更（Biome `useIterableCallbackReturn` 対応）。                            |
| **03-import-to-railway SSL**                 | `ssl: false` をやめ、localhost 以外では `ssl: { rejectUnauthorized: false }` を使用するよう変更。                                         |
| **03-import-to-railway の PII**              | ユーザー検証の SELECT から `email` を削除し、ログには `id` のみ出力するよう変更。                                                         |
| **sync-ai-models の exit code**              | プロバイダーエラー時（API キー未設定のスキップ以外）は `process.exit(1)` に変更。                                                         |
| **syncAiModels の fetch タイムアウト**       | 15 秒タイムアウトの `fetchWithTimeout` を追加し、OpenAI / Anthropic / Google の全 fetch で使用。                                          |
| **sortOrder の安定化**                       | Anthropic のループで `baseSortOrder = all.length` をループ前に取得し、`baseSortOrder + i` で sortOrder を設定（Copilot 指摘と同一対応）。 |
| **AISettingsForm のハードコード日本語**      | 上記 Copilot 対応と同一（i18n キー `aiSettings.modelsEmpty` を追加）。                                                                    |
| **GeneralSettingsForm の二重実行ガード**     | 上記 Copilot 対応と同一（`isResetting` ガードと `AlertDialogAction` の `disabled`）。                                                     |
| **成功トーストのタイミング**                 | `toast.success` を `runApiSync` と `queryClient.invalidateQueries` の後に移動。                                                           |
| **IndexedDB onblocked**                      | 上記 Copilot 対応と同一（`onblocked` で reject）。                                                                                        |
| **aiService のエラーメッセージ**             | `FetchServerModelsError` の `message` をユーザー向けの汎用文言にし、生の body は `details` および `console.error` のみに保持。            |
| **tier のバリデーション**                    | `data.tier` を "free"                                                                                                                     | "paid" に限定し、それ以外は "free" にフォールバック。 |
| **railway-remaining-tasks のコードブロック** | 全体フローのブロックに `text`、環境変数ブロックに `dotenv` を指定（MD040 対応）。                                                         |

**見送り・軽微として扱ったもの**

- **D-7 (DNS プレースホルダー)** / **D-8 (railway-next-steps の配置)** / **D-9 (package.json バージョン)**：計画どおり見送り。
- **E-1 (JSON parse 失敗時の fallback Y.Doc)**：一回限りのマイグレーションのため、自動 fallback は行わず手動対応とする方針で見送り。
- **C-4 (CACHE_PARSE)**：未使用のため code ユニオンから削除。
- **C-5 (console.warn)**：正常系のログを `console.debug` に変更。

---

### その他

- **Redis 作成コマンド**：`railway-next-steps.md` の `railway deploy --template redis` を、他ドキュメントに合わせて `railway add -d redis` に変更しました。

以上が、各レビュアーへの対応の記録です。
