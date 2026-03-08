# セルフレビュー: feature/ui-package-move

**日時**: 2026-03-08
**ベース**: develop
**変更ファイル数**: 163 files（develop との差分）
**関連ファイル数**: 10 files（admin API・admin 画面・テストを優先して確認）

## サマリー

`develop` からの主な変更は、(1) UI コンポーネントを `@zedi/ui` パッケージへ移行する大規模なリファクタ、(2) 管理画面のユーザー一覧・件数取得を API で行うようにする修正（`GET /api/admin/users` の追加・ページネーション・検索）、(3) 管理画面の AI モデル・ユーザーまわりの UI を `@zedi/ui` の Button / Table / Dialog / Card 等に差し替え、モバイル用カード表示（AiModelCard / UserCard）の追加。また `useDialogFocusTrap` を削除し、SyncPreviewModal は Radix 由来の `@zedi/ui` の Dialog に統一されている。レビューでは admin の論理変更と API 追加部分を重点的に確認した。

## ファイルサイズ

| ファイル                                            | 行数 | 判定 |
| --------------------------------------------------- | ---: | ---- |
| server/api/src/routes/admin/index.ts                |  107 | OK   |
| admin/src/pages/Login.tsx                           |   27 | OK   |
| admin/src/pages/ai-models/AiModelCard.tsx           |   76 | OK   |
| admin/src/pages/ai-models/AiModelRow.tsx            |   99 | OK   |
| admin/src/pages/ai-models/AiModelsContent.tsx       |  191 | OK   |
| admin/src/pages/ai-models/SyncPreviewModal.tsx      |  101 | OK   |
| admin/src/pages/ai-models/SyncPreviewModal.test.tsx |  211 | OK   |
| admin/src/pages/users/UserCard.tsx                  |   55 | OK   |
| admin/src/pages/users/UsersContent.tsx              |  139 | OK   |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #        | ファイル | 行  | 観点 | 指摘内容 | 推奨修正 |
| -------- | -------- | --- | ---- | -------- | -------- |
| （なし） | —        | —   | —    | —        | —        |

### 🟡 Warning（修正を推奨）

| #   | ファイル                             | 行  | 観点             | 指摘内容                                                                         | 推奨修正                                                                                                                   |
| --- | ------------------------------------ | --- | ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | server/api/src/routes/admin/index.ts | —   | テストカバレッジ | 新規追加の `GET /users` および `PATCH /users/:id` に対する単体テストが存在しない | ルート用のテストファイル（例: `admin/index.test.ts`）を追加し、検索・ページネーション・件数・role 更新・400/404 を検証する |

### 🟢 Info（任意の改善提案）

| #   | ファイル                                             | 行           | 観点           | 指摘内容                                                                                                      | 推奨修正                                                                                           |
| --- | ---------------------------------------------------- | ------------ | -------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | admin/src/pages/users/UserCard.tsx, UsersContent.tsx | 18–27, 18–27 | 可読性・保守性 | `formatDate(iso)` が両ファイルに同一実装で重複している                                                        | 共通ユーティリティ（例: `admin/src/lib/format.ts`）に切り出し、両方から import する                |
| 2   | admin/src/pages/ai-models/SyncPreviewModal.test.tsx  | 175, 187     | テスト         | 仕様変更に伴い「open 時にキャンセルボタンへフォーカスする」から「キャンセルボタンが存在する」に緩和されている | Radix Dialog にフォーカス管理が含まれるため妥当。E2E や実 DOM でフォーカスを検証する場合は別途検討 |

## テストカバレッジ

| 変更ファイル                                         | テストファイル            | 状態                                         |
| ---------------------------------------------------- | ------------------------- | -------------------------------------------- |
| server/api/src/routes/admin/index.ts                 | —                         | ⚠️ テスト未作成                              |
| admin/src/pages/Login.tsx                            | —                         | ⚠️ テスト未作成（既存どおり）                |
| admin/src/pages/ai-models/SyncPreviewModal.tsx       | SyncPreviewModal.test.tsx | ✅ 既存テストあり（@zedi/ui モック追加済み） |
| admin/src/pages/ai-models/AiModelsContent.tsx        | —                         | ⚠️ テスト未作成（既存どおり）                |
| admin/src/pages/users/UsersContent.tsx, UserCard.tsx | —                         | ⚠️ テスト未作成（既存どおり）                |

## Lint / Format チェック

- `bun run lint`: **通過**（0 errors, 57 warnings。今回の変更ファイルに起因する新規 warning はなし）
- `bun run format:check`: **通過**（All matched files use Prettier code style!）

## セキュリティ・設計メモ

- **GET /api/admin/users**: `search` を `like(users.email, ...)` に渡す前に `[%_\\]` をエスケープしており、LIKE インジェクション対策として妥当。
- **PATCH /api/admin/users/:id**: `role` を `"user" | "admin"` に限定しており、認可は既存の `adminRequired` ミドルウェアで担保されている。
- **SyncPreviewModal**: 独自の `useDialogFocusTrap` を廃止し `@zedi/ui` の Dialog（Radix）に統一。フォーカス・Escape・オーバーレイは Radix 側で扱われるため、前回レビュー指摘の「フォーカストラップ不足」は本対応で解消されている。

## 統計

- Critical: 0 件
- Warning: 1 件
- Info: 2 件
