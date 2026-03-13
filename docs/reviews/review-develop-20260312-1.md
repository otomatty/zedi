# セルフレビュー: develop（main との差分）

**日時**: 2026-03-12
**ベース**: main
**変更ファイル数**: 41 files
**関連ファイル数**: 変更含め多数（knip/CI/incident 含む）

## サマリー

develop は main に対し、(1) **セキュリティ**: CSRF Origin チェック追加・docker-compose のインライン認証情報削除、(2) **デプロイ耐性**: Cloudflare Pages デプロイのリトライとログ収集、(3) **フロント認証・信頼性**: サインインコールバックのタイムアウト・エラー表示、サインイン失敗時の UI、API base URL のフォールバック（`window.location.origin`）、(4) **knip 導入**: 未使用コード検出と CI ジョブ追加、(5) **大量の未使用コード削除**（noteRepository, copilotSyncSettings, NotesSection, WelcomeModal, SyncIndicator, AIChatSuggestions 等）、(6) **コンテキストメニュー削除時のホーム凍結修正**（PageCard の modal と onSelect 遅延、E2E 追加）、(7) **CollaborationManager の keepalive ペイロード制限** 対応、を反映している。設計・セキュリティ・運用の改善が中心で、破壊的変更は削除されたモジュールを参照していた箇所の整理（knip ベース）に限定されている。

## ファイルサイズ

| ファイル                                | 行数（差分後） | 判定                       |
| --------------------------------------- | -------------- | -------------------------- |
| server/api/src/middleware/csrfOrigin.ts | 50             | OK                         |
| scripts/delete-merged-branches.sh       | 増加           | OK（既存スクリプト拡張）   |
| knip.json                               | 95             | OK（新規設定）             |
| その他変更ファイル                      | -              | 削除が多いため行数増加なし |

※ 削除されたファイル（noteRepository.ts 等）は 250 行超だったが、削除により解消。

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル | 行  | 観点             | 指摘内容                                                                                                 | 推奨修正                                                        | 対応                         |
| --- | -------- | --- | ---------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------- |
| 1   | （複数） | -   | プロジェクト規約 | develop ブランチで `bun run format:check` が失敗している。変更の入った 10 ファイルで Prettier が未適用。 | `bun run format` を実行し、該当ファイルを整形してコミットする。 | ✅ `bun run format` 実行済み |

**対象ファイル（format:check で指摘）**:

- `src/components/editor/TiptapEditor/thumbnailApiHelpers.test.ts`
- `src/components/editor/TiptapEditor/thumbnailApiHelpers.ts`
- `src/components/editor/TiptapEditor/useThumbnailCommit.ts`
- `src/hooks/useProfile.ts`
- `src/i18n/locales/en/auth.json`
- `src/i18n/locales/ja/auth.json`
- `src/lib/auth/authClient.ts`
- `src/lib/collaboration/CollaborationManager.ts`
- `src/pages/AuthCallback.tsx`
- `src/pages/SignIn.tsx`

### 🟡 Warning（修正を推奨）

| #   | ファイル              | 行  | 観点         | 指摘内容                                                                                                                                                                                                                                   | 推奨修正                                                                                                                                     | 対応                                                   |
| --- | --------------------- | --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | deploy-prod.yml       | -   | 運用         | Cloudflare のデプロイが `cloudflare/wrangler-action@v3` から `nick-fields/retry` + `bunx wrangler pages deploy` に変更されている。リトライとログ収集は良いが、`apiToken`/`accountId` は `env` で渡すと wrangler が環境変数で読むか要確認。 | Wrangler のドキュメントで CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID の読み方を確認し、必要なら `env` で渡す現状を明示するコメントを残す。 | ✅ コメント追加（wrangler が env から読む旨）          |
| 2   | csrfOrigin.ts         | 39  | セキュリティ | `getAllowedOrigins()` が空配列を返す場合（CORS ワイルドカード等）は CSRF チェックをスキップしている。本番で CORS_ORIGIN 未設定だと保護が無効になる。                                                                                       | 本番では CORS_ORIGIN を必ず設定する旨を .env.example やドキュメントで明記する。                                                              | ✅ .env.example に本番用 CORS_ORIGIN 説明を追加        |
| 3   | useThumbnailCommit.ts | -   | 保守性       | 401 時に `redirectToSignIn` を付与した Error を throw し、catch 側で `navigate("/sign-in")` している。カスタムプロパティ付き Error はやや読みにくい。                                                                                      | 定数または専用の小さな型（例: `AuthRedirectError`）でラベル付けし、コメントで意図を書く。                                                    | ✅ `AuthRedirectError` 型と `isAuthRedirectError` 追加 |

### 🟢 Info（任意の改善提案）

| #   | ファイル                               | 行  | 観点           | 指摘内容                                                                                                               | 推奨修正                                                                                        |
| --- | -------------------------------------- | --- | -------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | CollaborationManager.ts                | -   | パフォーマンス | `fireAndForgetSave` で body サイズに応じて `keepalive` を切り替えている。63 KiB の閾値は適切。                         | 定数 `KEEPALIVE_PAYLOAD_LIMIT` に「64 KiB 制限」のコメントがあり良好。特になし。                |
| 2   | authClient.ts / thumbnailApiHelpers.ts | -   | 可読性         | `getAuthBaseUrl()` と `getThumbnailApiBaseUrl()` で同様の「VITE_API_BASE_URL が空なら origin」ロジックが重複している。 | 共通化する場合は `src/lib/apiBaseUrl.ts` のようなユーティリティにまとめると DRY。必須ではない。 |
| 3   | lib/collaboration/index.ts             | -   | アーキテクチャ | バレルファイルが削除され、呼び出し元は `CollaborationManager` や `types` を直接 import している。                      | 既存の import パスが直接指定のため問題なし。削除でよい。                                        |

## テストカバレッジ

| 変更ファイル                            | テストファイル              | 状態                                                                      |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| server/api/src/middleware/csrfOrigin.ts | -                           | ⚠️ テスト未作成（ミドルウェア単体テストがあると安心）                     |
| thumbnailApiHelpers.ts                  | thumbnailApiHelpers.test.ts | ✅ 既存テストあり（差分で微修正）                                         |
| useThumbnailCommit.ts                   | -                           | ⚠️ 直接の単体テストは未確認（E2E で画像保存はカバーされている可能性あり） |
| useProfile.ts                           | useProfile.test.ts          | ✅ 既存テストあり                                                         |
| AuthCallback.tsx / SignIn.tsx           | -                           | ⚠️ 認証フローは E2E または手動確認推奨                                    |
| PageCard.tsx                            | -                           | ✅ E2E page-editor.spec.ts でコンテキストメニュー削除を追加               |
| CollaborationManager.ts                 | -                           | 既存テストの有無は未確認                                                  |

## Lint / Format チェック

- **Lint**: `bun run lint` → **0 errors**, 79 warnings（既存の max-lines-per-function 等。今回の変更に起因するエラーなし）
- **Format**: `bun run format:check` → **通過**（対応後に `bun run format` 実行済み）

## 統計

- Critical: 1 件 → **対応済み**
- Warning: 3 件 → **対応済み**
- Info: 3 件（任意）
