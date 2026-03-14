# セルフレビュー: develop

**日時**: 2026-03-15  
**ベース**: develop（未コミット変更を対象）  
**変更ファイル数**: 13 modified + 新規コード多数（extension, ext API, ExtensionAuth 等）  
**関連ファイル数**: 20 files 上限で優先して確認

## サマリー

`develop` ブランチ上で未コミットの変更を対象にレビューした。Chrome 拡張の OAuth（PKCE）＋ clip-and-create および Web アプリ側の clipUrl 導線が一貫して実装されている。前回指摘の Critical 3 件（SSRF 対策・OAuth state 検証・useEffect 内 setState）および Warning の多くはコード上で対応済み。残りは Warning 2 件と Info 2 件。

## ファイルサイズ

| ファイル                                                   | 行数 | 判定                         |
| ---------------------------------------------------------- | ---: | ---------------------------- |
| `src/lib/webClipper.ts`                                    |  262 | Warning: 250行超（分割推奨） |
| `src/components/editor/useWebClipperDialogSubmit.ts`       |  204 | OK                           |
| `server/api/src/lib/extAuth.ts`                            |  173 | OK                           |
| `server/api/src/routes/ext.ts`                             |  165 | OK                           |
| `src/components/layout/useFloatingActionButtonHandlers.ts` |  138 | OK                           |
| `src/pages/ExtensionAuth.tsx`                              |  127 | OK                           |
| `src/components/editor/WebClipperDialog.tsx`               |  126 | OK                           |
| `src/components/layout/FloatingActionButton.tsx`           |  109 | OK                           |
| `src/pages/ExtensionAuthCallback.tsx`                      |   80 | OK                           |
| `server/api/src/lib/clipUrlPolicy.ts`                      |   28 | OK                           |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

**0 件**（前回指摘分は対応済み）

- SSRF: `server/api/src/lib/clipUrlPolicy.ts` で localhost / プライベートIP / link-local 等を拒否し、`ext.ts` の clip-and-create で採用済み。
- OAuth state: `extension/popup.js` でリダイレクト受信時に `returnedState !== state` で照合し、不一致時は reject 済み。
- useEffect 内 setState: `FloatingActionButton` で `isWebClipperOpenDerived` に集約し、effect 内 setState を廃止済み。

### 🟡 Warning（修正を推奨）

| #   | ファイル                        |    行 | 観点           | 指摘内容                                                                                               | 推奨修正                                                                          |
| --- | ------------------------------- | ----: | -------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | `src/lib/webClipper.ts`         |     - | 可読性・保守性 | 262 行で 250 行超。URL 検証・抽出・エラーハンドリングが混在。                                          | `urlPolicy` / `extractor` / `errorMapping` 等に分割し、テスト単位を明確化。       |
| 2   | `server/api/src/lib/extAuth.ts` | 88–95 | セキュリティ   | `EXTENSION_ORIGIN` 未設定時に `*.chromiumapp.org` を許容。運用ミスで想定外クライアントを受け入れうる。 | 本番では env 必須化（未設定時 fail fast）。必要なら extension ID 単位で厳密許可。 |

### 🟢 Info（任意の改善提案）

| #   | ファイル                  |  行 | 観点     | 指摘内容                                                                                | 推奨修正                                                                      |
| --- | ------------------------- | --: | -------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `extension/manifest.json` |   - | 最小権限 | `host_permissions` に localhost 等が含まれる。配布ビルドで過剰権限になりやすい。        | dev/prod で manifest を分離するか、ビルド時に権限を差し替え。                 |
| 2   | `e2e/web-clipper.spec.ts` |   - | テスト   | clipUrl の正/負ケースはある。未ログイン時 returnTo 復帰や `from` なしの挙動は未カバー。 | 未ログイン時のリダイレクト復帰やクエリバリエーションの E2E を追加すると堅牢。 |

## テストカバレッジ

| 変更ファイル                                     | テストファイル                                | 状態                                        |
| ------------------------------------------------ | --------------------------------------------- | ------------------------------------------- |
| `src/lib/webClipper.ts`                          | `src/lib/webClipper.test.ts`                  | ✅ 既存テスト更新あり                       |
| `src/pages/Home.tsx`                             | `e2e/web-clipper.spec.ts`                     | ✅ E2E あり（clipUrl 正/負/from なし）      |
| `src/components/layout/FloatingActionButton.tsx` | -                                             | ⚠️ 直接テストなし                           |
| `server/api/src/routes/ext.ts`                   | `server/api/src/__tests__/routes/ext.test.ts` | ✅ API テスト追加（401/400/SSRF/200）       |
| `server/api/src/lib/extAuth.ts`                  | `server/api/src/lib/extAuth.test.ts`          | ✅ PKCE/redirect_uri/JWT ユニットテスト追加 |
| `server/api/src/lib/clipUrlPolicy.ts`            | `server/api/src/lib/clipUrlPolicy.test.ts`    | ✅ 単体テスト追加（SSRF 拒否網羅）          |
| `server/api/src/lib/clipAndCreate.ts`            | -                                             | ⚠️ 失敗系は ext ルート経由で間接的にカバー  |
| `extension/popup.js`                             | -                                             | ⚠️ OAuth フロー自動テスト未作成             |

## Lint / Format チェック

- **`bun run lint`**: ✅ **error 0**（warnings のみ。変更ファイルに新規 error なし）
- **`bun run format:check`**: リポジトリ全体で未整形ファイルあり（変更ファイル含む）。今回スコープ外だが、コミット前に `bun run format` を推奨。

## 統計

- Critical: 0 件
- Warning: 2 件
- Info: 2 件

## 前回対応の確認（2026-03-15 時点）

| 指摘                            | 確認結果                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Critical 1 (SSRF)               | ✅ `clipUrlPolicy.ts` でサーバー側ポリシー実装、`ext.ts` で利用                             |
| Critical 2 (OAuth state)        | ✅ `extension/popup.js` で `returnedState !== state` を検証                                 |
| Critical 3 (setState-in-effect) | ✅ FAB で `isWebClipperOpenDerived` に集約、effect 内 setState なし                         |
| Warning 1 (initialUrl)          | ✅ `useWebClipperDialogSubmit` で `open && initialUrl` 時に `setUrl` + appliedInitialUrlRef |
| Warning 2 (CSRF 除外)           | ✅ `csrfOrigin.ts` で `/api/ext/session` と `/api/ext/clip-and-create` のみ除外             |
| Warning 4 (code 原子性)         | ✅ `extAuth.ts` の `consumeExtensionCode` で getdel/Lua による原子取得・削除                |
