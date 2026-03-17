# セルフレビュー: develop

**日時**: 2026-03-17 15:34  
**ベース**: main  
**変更ファイル数**: 110 files  
**関連ファイル数**: 20 files（上限適用）

## サマリー

`main..develop` の差分（14コミット）を対象に、設定画面再構成、Chrome 拡張認証/クリップ導線、`/api/ext` 新設、SSRF 対策ロジックの追加を中心にレビューしました。  
全体として機能追加は妥当ですが、SSRF 対策の仕様上の穴と `format:check` 失敗があり、マージ前の修正を推奨します。

## ファイルサイズ

| ファイル                                           | 行数 | 判定                           |
| -------------------------------------------------- | ---: | ------------------------------ |
| src/lib/webClipper.ts                              |  273 | Warning: 250行超（分割を推奨） |
| src/pages/Onboarding.tsx                           |  207 | OK                             |
| src/components/editor/useWebClipperDialogSubmit.ts |  204 | OK                             |
| src/components/settings/useAISettingsForm.ts       |  196 | OK                             |
| server/api/src/lib/extAuth.ts                      |  188 | OK                             |
| server/api/src/**tests**/routes/ext.test.ts        |  186 | OK                             |
| server/api/src/routes/ext.ts                       |  170 | OK                             |
| src/lib/webClipper.test.ts                         |  163 | OK                             |
| src/components/settings/SettingsHeaderNav.tsx      |  127 | OK                             |
| src/pages/Settings.tsx                             |  102 | OK                             |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル                                                                                                                              |   行 | 観点                 | 指摘内容                                                                                                                                                                                                                                  | 推奨修正                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---: | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | server/api/src/lib/clipUrlPolicy.ts                                                                                                   | 8-35 | セキュリティ         | SSRF 判定が「文字列ベースのホスト名チェック」のみで、公開ドメインが内部IPへ解決されるケース（DNS rebinding / internal DNS）を防げない。`/api/ext/clip-and-create` からサーバー側 fetch に到達するため、内部ネットワーク到達リスクが残る。 | URL 正規化後に DNS 解決を行い、解決先 IP が private/link-local/loopback の場合は拒否するサーバー側検証を追加。 |
| 2   | package.json, .github/workflows/ci.yml, .github/workflows/nightly-mutation.yml, docs/guides/testing-guidelines.md, stryker.config.mjs |    - | プロジェクト規約準拠 | `bun run format:check` が失敗（Prettier 不一致 5 ファイル）。                                                                                                                                                                             | 対象 5 ファイルを Prettier で整形し、`bun run format:check` を通す。                                           |

### 🟡 Warning（修正を推奨）

| #   | ファイル                                                                  |             行 | 観点           | 指摘内容                                                                                                                                        | 推奨修正                                                                                            |
| --- | ------------------------------------------------------------------------- | -------------: | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | server/api/src/routes/ext.ts, server/api/src/**tests**/routes/ext.test.ts | 27-135, 51-186 | テスト         | 新規追加の `/api/ext/session`, `/api/ext/authorize-code`（GET/POST）の正常系・異常系テストが不足。現状テストは `clip-and-create` に偏っている。 | `session` の grant_type/PKCE/redirect mismatch、`authorize-code` の auth 必須/redirect 検証を追加。 |
| 2   | src/lib/webClipper.ts                                                     |          1-273 | 可読性・保守性 | 単一ファイルに URL policy、fetch fallback、sanitize、抽出、エラー整形が同居し責務が広い（250行超）。                                            | `clipUrlPolicy`、`sanitize`、`errorMessage`、`clipWebPage` 実処理へ分割。                           |
| 3   | src/pages/ExtensionAuth.tsx                                               | 61-72, 141-142 | 規約準拠       | 文言の一部が i18n キー未使用（英語ハードコード）。既存画面は i18n ベースのため一貫性が落ちる。                                                  | `auth`/`extension` 名前空間へ文言キーを追加し `t()` へ統一。                                        |

### 🟢 Info（任意の改善提案）

| #   | ファイル                                                              |            行 | 観点                 | 指摘内容                                                                | 推奨修正                                                                                        |
| --- | --------------------------------------------------------------------- | ------------: | -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | src/components/editor/useWebClipperDialogSubmit.ts                    |        55-204 | アーキテクチャ・設計 | `WebClipperDialog` から submit/close 制御を hook へ分離した構成は良い。 | この hook へユニットテストを追加すると、非同期キャンセル（generation 管理）の回帰を防ぎやすい。 |
| 2   | src/pages/Settings.tsx, src/components/settings/SettingsHeaderNav.tsx | 32-97, 30-127 | UX/保守性            | セクション単位表示 + ヘッダーナビはモバイル操作性が向上。               | `SettingsHeaderNav` のキーボード操作（左右移動）を将来的に追加するとさらにアクセシブル。        |

## テストカバレッジ

| 変更ファイル                                | テストファイル                                   | 状態                               |
| ------------------------------------------- | ------------------------------------------------ | ---------------------------------- |
| server/api/src/lib/clipUrlPolicy.ts         | server/api/src/lib/clipUrlPolicy.test.ts         | ✅ 新規テストあり                  |
| server/api/src/routes/ext.ts                | server/api/src/**tests**/routes/ext.test.ts      | ⚠️ 一部のみ（clip-and-create中心） |
| server/api/src/lib/extAuth.ts               | -                                                | ⚠️ テスト未作成                    |
| src/pages/Settings.tsx                      | src/pages/Settings.test.tsx                      | ✅ 既存テスト更新あり              |
| src/components/settings/SettingsSection.tsx | src/components/settings/SettingsSection.test.tsx | ✅ 既存テスト更新あり              |
| src/lib/webClipper.ts                       | src/lib/webClipper.test.ts                       | ✅ テスト追加あり                  |
| src/pages/ExtensionAuth.tsx                 | -                                                | ⚠️ テスト未作成                    |
| src/pages/ExtensionAuthCallback.tsx         | -                                                | ⚠️ テスト未作成                    |

## Lint / Format チェック

- `bun run lint`: 実行成功（0 errors / 2138 warnings）
- `bun run format:check`: **失敗**（Prettier 不一致 5 files）

## 統計

- Critical: 2 件
- Warning: 3 件
- Info: 2 件

## 補足（スコープ）

差分は 110 ファイルと広いため、本レビューでは以下の高影響領域を優先して 20 ファイルを精査しました:  
設定画面再設計、オンボーディング共通化、Web Clipper ダイアログ分割、Chrome 拡張認証、`server/api` の `/api/ext` と URL policy。  
未精査ファイルは次回レビューで追跡することを推奨します。

## 対応状況（2026-03-17 対応分）

- **Critical 1**: `clipUrlPolicy` に `isClipUrlAllowedAfterDns` を追加し、DNS 解決後の IP が private/loopback/link-local の場合は拒否するようにした。`ext.ts` の clip-and-create で同関数を呼ぶように変更。単体テストを追加。
- **Critical 2**: 該当 5 ファイルを Prettier で整形し、`bun run format:check` 通過を確認。
- **Warning 1**: `ext.test.ts` に POST /session（grant_type・必須パラム・redirect_uri・PKCE・成功）と GET/POST /authorize-code（401・必須パラム・redirect 不許可・成功）のテストを追加。
- **Warning 2**: `src/lib/webClipper.ts` を `src/lib/webClipper/` に分割（types, urlPolicy, sanitizeHtml, getClipErrorMessage, clipWebPage, index）。既存の `@/lib/webClipper` は index 経由で互換維持。
- **Warning 3**: `auth.extension` キーを en/ja の auth.json に追加し、`ExtensionAuth.tsx` の文言を `t("auth.extension.*")` に変更。
