# Web Clipper UX 改善の調査・実装検討

## 概要

Web ページ取り込み機能（Web Clipper）について、以下の3点の改善を検討する。

1. **URL 貼り付け時の自動解析**: URL を貼り付けた瞬間に自動的に URL を解析し、ユーザーは取り込むボタンをクリックするだけで完了するようにする
2. **取り込み表示の整理**: 取り込んだことを示すコンポーネントをやめ、ページ先頭の引用元表示（既存実装）のみにする
3. **サムネイルの自動登録**: 取り込んだページに OGP サムネイルがあれば、ページ先頭に埋め込むことで自動的にサムネイルとして登録する

---

## 現状の実装状況

### 1. URL 取り込みダイアログ（WebClipperDialog）

**ファイル**: `src/components/editor/WebClipperDialog.tsx`

**現在のフロー**:

1. ユーザーが URL を入力（または貼り付け）
2. ユーザーが「取り込み」ボタンをクリック
3. `clip(url)` が実行され、API または CORS プロキシ経由で HTML を取得
4. Readability.js で本文抽出、OGP 情報取得
5. 成功時: プレビュー表示後、ユーザーが再度「取り込み」をクリックして `onClipped` 呼び出し → ダイアログ閉じる

※ 実際のコードでは、`handleClip` 内で `clip(url)` の結果が返った直後に `onClipped` を呼び出してダイアログを閉じている。つまり「取り込み」1回クリックで完了するが、そのクリックまでユーザーは待機する。

**改善の方向性**: URL を貼り付けた（または入力完了した）時点で自動的に `clip(url)` を開始し、解析完了後にユーザーが「取り込み」ボタンをクリックするだけで確定する。解析はバックグラウンドで行うため、ボタンクリック時の待ち時間を短縮する。

### 2. 取り込み表示に関連するコンポーネント

| コンポーネント                   | 場所                      | 役割                                                                   | 対応                             |
| :------------------------------- | :------------------------ | :--------------------------------------------------------------------- | :------------------------------- |
| **SourceUrlBadge**               | `PageEditorContent.tsx`   | ページエディタ上部に「引用元: [hostname]」を表示                       | ✅ 残す（既存の引用元表示）      |
| **formatClippedContentAsTiptap** | `src/lib/htmlToTiptap.ts` | クリップしたコンテンツの先頭に「📎 引用元: [link]」段落 + 水平線を挿入 | ❌ 削除（SourceUrlBadge と重複） |
| **PageCard / NotePageCard**      | `isClipped`               | Date Grid でクリップ済みページに Link2 アイコンを表示                  | 要確認（ユーザー意図次第）       |

**ユーザー要件の解釈**: 「取り込んだことを示すコンポーネントをやめて、ページの先頭に引用元を表示するだけ」 → ページビュー内の**重複した引用元表示**（📎 引用元ブロック）を削除し、SourceUrlBadge のみにする。

### 3. サムネイルまわりの仕組み

| 要素                                  | 場所                                            | 役割                                                      |
| :------------------------------------ | :---------------------------------------------- | :-------------------------------------------------------- |
| **OGP 抽出**                          | `webClipper.ts` → `extractOGPData`              | `og:image` を `thumbnailUrl` として取得                   |
| **createPage**                        | `FloatingActionButton.tsx` → `handleWebClipped` | `thumbnailUrl` を `createPage` に渡してページ作成時に登録 |
| **extractFirstImage**                 | `contentUtils.ts`                               | Tiptap JSON から先頭の `image` ノードの `src` を抽出      |
| **usePageEditorAutoSaveWithMutation** | 編集中                                          | 保存時に `extractFirstImage(content)` でサムネイルを更新  |

**現在**: クリップ時に `thumbnailUrl`（OGP の外部 URL）を `createPage` に渡している。外部 URL のままだと、ホットリンク制限や CORS で表示できない場合がある。

**要望**: 「サムネイルがあればページの先頭に埋め込み、自動的にサムネイルとして登録する」 → コンテンツ先頭に画像ノードを挿入すれば、`extractFirstImage` によりサムネイルとして扱われる。ただし、外部 URL をそのまま埋め込むと上記リスクがあるため、**thumbnail/commit API で自前ストレージに保存してから埋め込む**のが望ましい。

---

## 実装方針の提案

### タスク 1: URL 貼り付け時の自動解析

**実装箇所**: `WebClipperDialog.tsx`, `useWebClipper.ts`（必要に応じて）

**方針**:

1. **トリガー**: URL 入力フィールドで以下を検知
   - `onPaste`: 貼り付け時にクリップボードのテキストが有効な URL なら `clip()` を実行
   - `onChange`（debounce 500ms）: 入力値が有効な URL に変化したら `clip()` を実行（貼り付けだけでなく手入力にも対応）
2. **状態管理**:
   - URL 変更時に前回の解析結果をリセット（`reset()`）
   - 同一 URL の再解析を避けるため、前回解析した URL を保持
3. **取り込みボタン**:
   - `clippedContent` が存在する場合のみ有効化（解析完了後でないとクリック不可）
   - クリック時は `getTiptapContent()` で生成した内容を `onClipped` に渡す（再 fetch なし）
4. **UX**:
   - 解析中は「取り込み」ボタンをローディング表示または無効化
   - 解析完了後にプレビュー表示し、ユーザーが「取り込み」で確定

**注意点**:

- 入力中に誤って有効 URL になった場合の誤発火を防ぐため、debounce は必須
- 貼り付け時は即時発火、手入力は debounce 後の発火がバランス良い

### タスク 2: 引用元ブロックの削除（formatClippedContentAsTiptap）

**実装箇所**: `src/lib/htmlToTiptap.ts`

**変更内容**:

- `formatClippedContentAsTiptap` から `sourceInfo`（📎 引用元段落）と `horizontalRule` を削除
- 戻り値の `content` を `mainContent.content` のみにする
- 引用元表示は `PageEditorContent` 内の `SourceUrlBadge` が担当（`source_url` は引き続き `createPage` で保存）

**影響範囲**:

- `useWebClipper.ts` の `getTiptapContent` が本関数を呼ぶため、出力形式が変わる
- 既存のクリップ済みページのコンテンツには変更なし（新規クリップ分のみ影響）

### タスク 3: OGP サムネイルのページ先頭埋め込み

**実装箇所**: `src/lib/htmlToTiptap.ts`, `useWebClipper.ts`, `WebClipperDialog.tsx`（またはクライアント側）

**方針 A: 外部 URL をそのまま埋め込む（シンプル）**

- `formatClippedContentAsTiptap` に `thumbnailUrl?: string | null` を追加
- `thumbnailUrl` がある場合、`mainContent` の先頭に `image` ノードを挿入
- `createPage` には従来通り `thumbnailUrl` を渡す（カード表示用）
- メリット: 実装が簡単
- デメリット: 外部 URL の hotlink 制限で表示不可になる可能性

**方針 B: thumbnail/commit API で保存してから埋め込む（推奨）**

- クライアント側で `thumbnailUrl`（OGP）がある場合、`/api/thumbnail/commit` を呼び出して自前ストレージに保存
- 返却された `imageUrl` をコンテンツ先頭の `image` ノードに使用
- `createPage` にもこの `imageUrl` を `thumbnailUrl` として渡す
- メリット: 表示の安定性、ホットリンク制限の回避
- デメリット: 非同期処理が増え、クリップ完了までの時間がやや伸びる

**推奨**: 方針 B。`useThumbnailCommit` の `commitViaServerS3` と同様のロジックを、Web Clipper の `onClipped` 直前（または `handleClip` 内）で実行する。

**実装手順（方針 B）**:

1. `formatClippedContentAsTiptap` に `thumbnailUrl?: string | null` を追加し、ある場合は先頭に `image` ノードを挿入（`thumbnailUrl` は commit 後の URL を想定）
2. `handleWebClipped`（または WebClipperDialog 内）で、`clippedContent.thumbnailUrl` がある場合:
   - `thumbnail/commit` API を呼んで画像を保存
   - 返却 URL を `formatClippedContentAsTiptap` の `thumbnailUrl` および `createPage` の `thumbnailUrl` に渡す
3. コミット API が失敗した場合は、サムネイルなしでコンテンツのみ保存（フォールバック）

---

## 影響範囲の整理

| ファイル                                         | 変更内容                                                                                |
| :----------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `src/components/editor/WebClipperDialog.tsx`     | URL 貼り付け・変更時の自動 clip、取り込みボタンの有効/無効制御                          |
| `src/lib/htmlToTiptap.ts`                        | `formatClippedContentAsTiptap` から引用元ブロック削除、サムネイル画像ノード先頭挿入対応 |
| `src/hooks/useWebClipper.ts`                     | `getTiptapContent` に `thumbnailUrl` を渡せるようにする（必要に応じて）                 |
| `src/components/layout/FloatingActionButton.tsx` | `handleWebClipped` 内で thumbnail/commit 呼び出し（方針 B の場合）                      |
| テスト                                           | `useWebClipper.test.ts`, `WebClipperDialog` の E2E 等                                   |

---

## 確認事項（issue 起票前）

1. **PageCard / NotePageCard の Link2 アイコン**: 「取り込んだことを示すコンポーネント」に Date Grid のアイコンも含めるか。含める場合は `isClipped` 表示を削除する。
2. **サムネイル方針**: 方針 A（外部 URL そのまま）か方針 B（commit API で保存）か。本ドキュメントでは B を推奨。
3. **自動解析のトリガー**: 貼り付けのみとするか、`onChange` + debounce も含めるか。

---

## 次のステップ

1. 上記確認事項について合意を得る
2. 本ドキュメントをベースに GitHub issue を起票
3. 実装後、E2E および手動確認で動作を検証
