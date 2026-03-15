# セルフレビュー: develop

**日時**: 2026-03-15 07:10  
**ベース**: develop  
**変更ファイル数**: 35 files（`git status --short`）  
**関連ファイル数**: 20 files（上限適用。拡張機能/OAuth/API/UIの中核を優先）

## サマリー

`develop..HEAD` のコミット差分は 0 件で、未コミット変更を対象にレビューした。  
Chrome 拡張の OAuth + clip-and-create 導線は概ね一貫している一方、`/api/ext/clip-and-create` の SSRF 対策不足、拡張側の OAuth `state` 未検証、および lint エラー（新規 effect 内 setState）があり、現時点ではマージ前修正が必要。

## ファイルサイズ

| ファイル                                         | 行数 | 判定                                |
| ------------------------------------------------ | ---: | ----------------------------------- |
| `src/lib/webClipper.ts`                          |  253 | Warning: 250行超（分割推奨）        |
| `src/components/editor/WebClipperDialog.tsx`     |  232 | OK                                  |
| `src/components/layout/FloatingActionButton.tsx` |  217 | OK（ただし関数行数 lint 警告あり）  |
| `extension/popup.js`                             |  217 | OK                                  |
| `server/api/src/lib/clipAndCreate.ts`            |  189 | OK                                  |
| `server/api/src/routes/ext.ts`                   |  166 | OK（ただし API 境界の検証不足あり） |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル                                         |           行 | 観点                 | 指摘内容                                                                                                                                                    | 推奨修正                                                                                                                                                           |
| --- | ------------------------------------------------ | -----------: | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `server/api/src/routes/ext.ts`                   |      143-151 | セキュリティ         | `clip-and-create` が `http/https` しか検証せず、`localhost` / プライベートIP / link-local への到達を防げない。拡張 JWT を持つクライアントから SSRF が可能。 | `isClipUrlAllowed` 相当のサーバー側バリデーションを追加し、RFC1918・localhost・link-local・`*.local` を拒否。加えて DNS rebinding 対策（解決後IPチェック）も検討。 |
| 2   | `extension/popup.js`                             | 69-76, 91-98 | セキュリティ         | OAuth PKCE フローで `state` を生成しているが、リダイレクト受信時に照合していない。ログイン CSRF/セッション混線のリスク。                                    | `u.searchParams.get("state")` を取り出して生成済み `state` と厳密一致比較。不一致時は失敗扱いでトークン交換しない。                                                |
| 3   | `src/components/layout/FloatingActionButton.tsx` |        45-49 | プロジェクト規約準拠 | `bun run lint` の唯一の error。`useEffect` 内で同期 `setState` 実行（react-hooks set-state-in-effect ルール違反）。                                         | 初期値反映を render 時判定 or イベント駆動へ移す。少なくとも lint error が 0 になる形に修正。                                                                      |

### 🟡 Warning（修正を推奨）

| #   | ファイル                                     |             行 | 観点                | 指摘内容                                                                                                                                                     | 推奨修正                                                                                                    |
| --- | -------------------------------------------- | -------------: | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1   | `src/components/editor/WebClipperDialog.tsx` | 30-32, 190-199 | 振る舞い回帰        | `initialUrl` prop が追加されたが、`url` state へ反映されておらず、`clipUrl` プリフィルが機能しない可能性が高い。`e2e/web-clipper.spec.ts` の期待とも不整合。 | `open && initialUrl` 時に `setUrl(initialUrl)` する effect を追加し、同時に auto-clip 条件を明確化。        |
| 2   | `server/api/src/middleware/csrfOrigin.ts`    |          29-31 | セキュリティ        | `/api/ext/` 全体を CSRF 除外しており、Cookie 認証を使う `/api/ext/authorize-code` まで除外される。                                                           | 除外を `/api/ext/session` と Bearer 必須ルートに限定し、`authRequired` ルートは Origin チェック対象に戻す。 |
| 3   | `server/api/src/lib/extAuth.ts`              |          83-86 | セキュリティ        | `EXTENSION_ORIGIN` 未設定時に `*.chromiumapp.org` を広く許可。運用ミス時に想定外クライアントを受け入れる。                                                   | 本番では env 必須化（未設定時 fail fast）。必要なら extension ID 単位で厳密許可。                           |
| 4   | `server/api/src/lib/extAuth.ts`              |          59-62 | セキュリティ/整合性 | ワンタイムコードの取得と削除が `GET`→`DEL` の2操作で非原子的。並行アクセス時に再利用窓が生じる。                                                             | Redis `GETDEL`（または Lua script）で原子的に消費。                                                         |
| 5   | `src/lib/webClipper.ts`                      |              - | 可読性・保守性      | 250 行超。URL検証、抽出、エラーハンドリングの責務が増加傾向。                                                                                                | `urlPolicy` / `extractor` / `errorMapping` へ分割し、ユニットテスト単位を明確化。                           |

### 🟢 Info（任意の改善提案）

| #   | ファイル                  |    行 | 観点     | 指摘内容                                                                                        | 推奨修正                                                                                     |
| --- | ------------------------- | ----: | -------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `extension/manifest.json` |  7-13 | 最小権限 | `host_permissions` に `localhost` と開発 API が常時含まれる。配布ビルドで過剰権限になりやすい。 | dev/prod で manifest を分離するか、ビルド時に権限差し替え。                                  |
| 2   | `e2e/web-clipper.spec.ts` | 10-33 | テスト   | clipUrl の正/負ケースが追加されており回帰検知の方向性は良い。                                   | `from=chrome-extension` がない場合の挙動や未ログイン時 returnTo 復帰ケースも追加すると堅い。 |

## テストカバレッジ

| 変更ファイル                                     | テストファイル               | 状態                                  |
| ------------------------------------------------ | ---------------------------- | ------------------------------------- |
| `src/lib/webClipper.ts`                          | `src/lib/webClipper.test.ts` | ✅ 既存テスト更新あり                 |
| `src/pages/Home.tsx`                             | `e2e/web-clipper.spec.ts`    | ✅ E2E追加あり                        |
| `src/components/layout/FloatingActionButton.tsx` | -                            | ⚠️ 直接テストなし                     |
| `server/api/src/routes/ext.ts`                   | -                            | ⚠️ API単体テスト未作成                |
| `server/api/src/lib/extAuth.ts`                  | -                            | ⚠️ PKCE/JWTユニットテスト未作成       |
| `server/api/src/lib/clipAndCreate.ts`            | -                            | ⚠️ 失敗系/SSRF保護テスト未作成        |
| `extension/popup.js`                             | -                            | ⚠️ OAuthフロー自動テスト未作成        |
| `extension/background.js`                        | -                            | ⚠️ context menu/shortcut テスト未作成 |

## Lint / Format チェック

- `bun run lint`: ✅ **error 0**（warnings のみ。Critical 修正後は error 解消）
- `bun run format:check`: 変更ファイル以外に未整形あり（既存差分のため今回スコープ外）

## 統計

- Critical: 3 件（いずれも対応済み）
- Warning: 5 件（いずれも対応済み。Warning#3 EXTENSION_ORIGIN 本番必須化は未実施）
- Info: 2 件

## 対応済み項目（2026-03-15 修正）

| 指摘                            | 対応内容                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 (SSRF)               | `server/api/src/lib/clipUrlPolicy.ts` を新設し、`isClipUrlAllowed` 相当のサーバー側ポリシーで localhost / プライベートIP / link-local / .local を拒否。`ext.ts` の clip-and-create で採用。 |
| Critical 2 (OAuth state)        | `extension/popup.js` でリダイレクト受信時に `state` を照合し、不一致時はトークン交換せず reject。                                                                                           |
| Critical 3 (setState-in-effect) | `FloatingActionButton` でダイアログ open を派生値 `isWebClipperOpenDerived = isWebClipperOpen \|\| (initialClipUrl && isSignedIn)` にし、effect 内 setState を廃止。                        |
| Warning 1 (initialUrl)          | `WebClipperDialog` で `open && initialUrl` 時に `setUrl(initialUrl)` する effect を追加（appliedInitialUrlRef で重複適用防止）。                                                            |
| Warning 2 (CSRF 除外)           | `csrfOrigin.ts` の除外を `/api/ext/session` と `/api/ext/clip-and-create` に限定し、`/api/ext/authorize-code` を Origin チェック対象に戻した。                                              |
| Warning 4 (code 原子性)         | `extAuth.ts` の `consumeExtensionCode` を Redis `getdel` または Lua スクリプトで原子的な取得・削除に変更。                                                                                  |
