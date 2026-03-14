# セルフレビュー: develop（未コミット変更）

**日時**: 2026-03-14
**ベース**: develop（ステージ済み変更を対象）
**変更ファイル数**: 8 files
**関連ファイル数**: 6 files

## サマリー

ESLint に `eslint-plugin-jsdoc` と `eslint-plugin-tsdoc` を導入し、export された関数・型・インターフェースに JSDoc/TSDoc コメントを必須とするルール（warning）を追加。あわせて、admin API・client・dateUtils、Web Clipper hook、FABMenu に JSDoc/TSDoc を追加してプロジェクト規約に準拠させている。

## ファイルサイズ

| ファイル                                          | 行数 | 判定     |
| ------------------------------------------------- | ---- | -------- |
| admin/src/api/admin.ts                            | 235  | OK       |
| admin/src/api/client.ts                           | 36   | OK       |
| admin/src/lib/dateUtils.ts                        | 20   | OK       |
| src/components/editor/useWebClipperDialogState.ts | 103  | OK       |
| src/components/layout/FABMenu.tsx                 | 138  | OK       |
| eslint.config.js                                  | 132  | OK       |
| package.json                                      | -    | 設定     |
| bun.lock                                          | -    | 自動生成 |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

なし

### 🟡 Warning（修正を推奨）

なし

### 🟢 Info（任意の改善提案）

| #   | ファイル                   | 行  | 観点             | 指摘内容                                                                                                | 推奨修正                                                                                    |
| --- | -------------------------- | --- | ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | プロジェクト全体           | -   | プロジェクト規約 | 新規 jsdoc/require-jsdoc により既存コードで 2368 件の warning が発生。現状は warning のみでビルドは通る | 段階的に JSDoc を追加するか、特定ディレクトリから適用範囲を絞る                             |
| 2   | admin/src/lib/dateUtils.ts | -   | テストカバレッジ | 専用のユニットテストがない                                                                              | `admin/src/lib/dateUtils.test.ts` を追加し、`formatDate` の正常・不正入力ケースをテストする |

## テストカバレッジ

| 変更ファイル                                      | テストファイル              | 状態                                               |
| ------------------------------------------------- | --------------------------- | -------------------------------------------------- |
| admin/src/api/admin.ts                            | admin/src/api/admin.test.ts | ✅ 既存テストあり                                  |
| admin/src/api/client.ts                           | admin.test.ts でモック使用  | ✅ 間接的にカバー                                  |
| admin/src/lib/dateUtils.ts                        | -                           | ⚠️ 専用テストなし（UsersContent で間接使用）       |
| src/components/editor/useWebClipperDialogState.ts | -                           | ⚠️ 専用テストなし（WebClipperDialog から使用）     |
| src/components/layout/FABMenu.tsx                 | -                           | ⚠️ 専用テストなし（FloatingActionButton から使用） |
| eslint.config.js                                  | -                           | 設定ファイル                                       |
| package.json                                      | -                           | 設定ファイル                                       |

## Lint / Format チェック

- **bun run lint**: ✅ 0 errors（既存の jsdoc warning は多数あり、今回の変更対象外）
- **bun run format:check**: ✅ All matched files use Prettier code style!

## 統計

- Critical: 0 件
- Warning: 0 件
- Info: 2 件
