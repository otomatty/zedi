# BubbleMenu から範囲選択で WikiLink を作成する機能 - 調査・提案

## 目的

- テキストを範囲選択したときに表示される **BubbleMenu** から、選択テキストを `[[タイトル]]` 形式の WikiLink（アプリ内リンク）に変換できるようにする。

## 現在の実装状況

### 1. BubbleMenu（EditorBubbleMenu）

- **場所**: `src/components/editor/TiptapEditor/EditorBubbleMenu.tsx`
- **表示条件**: `shouldShow` で「選択が空でない」「codeBlock 内でない」ときに表示。
- **既存ボタン**: 太字・イタリック・取り消し線・コード・ハイライト、箇条書き・番号付き・タスクリスト、テーブル挿入、文字色。
- **WikiLink 用のボタンは未実装。**

### 2. WikiLink の表現

- **拡張**: `src/components/editor/extensions/WikiLinkExtension.ts`
- **Mark**: `wikiLink`。属性は `title`, `exists`, `referenced`。
- **既存コマンド**: `setWikiLink({ title, exists })`, `unsetWikiLink()`。
- **保存形式**: Tiptap JSON ではテキストが `[[タイトル]]`、marks に `{ type: "wikiLink", attrs: { title, exists, referenced } }` を付与。

### 3. WikiLink の挿入（既存パターン）

- **`[[` 入力時のサジェスト**: `wikiLinkSuggestionPlugin` が `[[` を検知 → `WikiLinkSuggestion` でページ候補表示 → 選択時に `useSuggestionEffects.handleSuggestionSelect` で挿入。
- **挿入処理**（`useSuggestionEffects.ts` 94–108 行）:
  - `deleteRange({ from, to })` で `[[` とクエリ部分を削除
  - `insertContent([{ type: "text", marks: [{ type: "wikiLink", attrs: { title, exists, referenced } }], text: `[[${title}]]` }])` で WikiLink ノードを挿入
  - 新規ページ（`exists: false`）のときは `checkReferenced(title, pageId)` で `referenced` を取得してから挿入。

### 4. エディター構成

- **TiptapEditor**: `pageId` を受け取り、`EditorBubbleMenu` には現状 `editor` のみ渡している。
- **WikiLink 状態同期**: `useWikiLinkStatusSync` でコンテンツ内の WikiLink の `exists` / `referenced` を更新。保存時は `extractWikiLinksFromContent` でリンク一覧を取得し `syncWikiLinks` に渡している。

### 5. システムの範囲選択メニューと BubbleMenu の表示関係

- **「通常のツールバー」**: ここではスマホなどでテキストを範囲選択したときに表示される**システム標準のメニューバー**（コピー・貼り付け・全選択など）を指す。
- **EditorBubbleMenu**: 当アプリが表示する**独自の**範囲選択用メニュー（太字・イタリック・WikiLink 等）。選択位置付近に浮いて表示する。
- **結論**: システムの選択メニューと EditorBubbleMenu は**別物**のため、**両方とも同時に表示され得る**。特にスマホでは、範囲選択時にネイティブの選択メニューと当方の BubbleMenu の両方が出る可能性があり、配置が重なる・窮屈になる場合は、実装や配置（`placement`）の調整を検討する。

---

## 実装方針

### 方針 A: EditorBubbleMenu に「WikiLink にする」ボタンを追加（推奨）

- **やること**
  1. **EditorBubbleMenu** に「WikiLink にする」ボタン（例: リンクアイコン + ツールチップ「WikiLink」）を追加する。
  2. **表示条件**
     - 既存の BubbleMenu 表示条件（選択あり・codeBlock 外）に加え、
     - 選択範囲が **既に wikiLink マークのみ** のときはこのボタンを非表示（または「WikiLink を解除」に切り替え）にする。
  3. **クリック時の処理**
     - 選択範囲のテキスト `selectedText = editor.state.doc.textBetween(from, to).trim()` を取得。
     - `selectedText` が空なら何もしない。
     - 既存の `[[` サジェスト挿入と同じ形で、`deleteRange` → `insertContent` で `[[${selectedText}]]` と wikiLink マークを挿入。
     - 新規リンク（`exists: false`）にする場合、`referenced` を揃えたいなら `useCheckGhostLinkReferenced` を利用する（後述）。

- **参照の一貫性（任意）**
  - `[[` サジェストでは `checkReferenced(item.title, pageId)` で `referenced` を設定している。
  - BubbleMenu から作成する場合も同じにしたいなら、**EditorBubbleMenu に `pageId` をオプションで渡し**、`useCheckGhostLinkReferenced` を呼んでから `insertContent` する。
  - 初回は `referenced: false` 固定でもよい。保存後や他ページ編集時に `useWikiLinkStatusSync` が `referenced` を更新するため、挙動は遅れても揃う。

### 方針 B: 選択範囲が既に WikiLink のとき

- 選択全体が `wikiLink` マークのみの場合:
  - 「WikiLink にする」の代わりに「WikiLink を解除」ボタンを出し、`unsetWikiLink()` でマークだけ外す（表示テキスト `[[...]]` はそのまま残すか、外すかは仕様次第）。
- または、WikiLink 選択時は WikiLink 用ボタンを出さないだけにしてもよい。

---

## 推奨実装ステップ

1. **EditorBubbleMenu の props 拡張**
   - `pageId?: string` を追加（BubbleMenu は `TiptapEditor` から渡す）。

2. **「WikiLink にする」ボタン追加**
   - アイコン: `Link2`（lucide-react）など。
   - `shouldShow` は既存のまま（選択あり・codeBlock 外）でよい。
   - ボタン表示条件: 選択が空でない **かつ** 選択範囲が `wikiLink` のみでない（`!editor.isActive("wikiLink")` などで判定。範囲選択時は `editor.state.selection` から範囲を取得し、その範囲のマークを確認する必要がある場合は、`doc.rangeHasMark(from, to, wikiLinkType)` のような判定を検討）。

3. **クリックハンドラ**
   - `const { from, to } = editor.state.selection;`
   - `const text = editor.state.doc.textBetween(from, to, null, "\ufffc").trim();`
   - `if (!text) return;`
   - （任意）`pageId` がある場合: `checkReferenced(text, pageId)` で `referenced` を取得。
   - `editor.chain().focus().deleteRange({ from, to }).insertContent([{ type: "text", marks: [{ type: "wikiLink", attrs: { title: text, exists: false, referenced } }], text: `[[${text}]]` }]).run();`
   - `referenced` を使わない場合は `referenced: false` 固定。

4. **既存 WikiLink 選択時**
   - 選択範囲がすべて wikiLink のときは「WikiLink にする」を非表示にするか、「WikiLink を解除」を表示する。解除時は `editor.chain().focus().unsetWikiLink().run()` でマークのみ解除（テキスト `[[...]]` は残る）。

5. **TiptapEditor の修正**
   - `<EditorBubbleMenu editor={editor} pageId={pageId} />` のように `pageId` を渡す。

6. **テスト**
   - 範囲選択 → BubbleMenu の WikiLink ボタン表示 → クリックで `[[選択テキスト]]` に変換されることを確認。
   - codeBlock 内では BubbleMenu 自体が出ないことを確認。
   - 既存の `[[` サジェスト・保存・WikiLink 同期（syncWikiLinks / useWikiLinkStatusSync）が従来どおり動くことを確認。

---

## 補足

- **インラインコード内**: 現在の `shouldShow` では codeBlock だけ除外している。インラインコード（`code` mark）内の選択でも BubbleMenu は出る。WikiLink を code 内に作らせないなら、`shouldShow` で `editor.isActive("code")` のときも false にするか、WikiLink ボタンだけ「code 内では無効」にすることができる。
- **既存データとの整合**: 挿入形式は `useSuggestionEffects.handleSuggestionSelect` と同一にしてあるため、`extractWikiLinksFromContent` や `updateWikiLinkAttributes` はそのまま利用できる。

---

## まとめ

- **現状**: BubbleMenu はテキスト選択時に表示されるが、WikiLink 用の操作はない。WikiLink は `[[` 入力＋サジェストでのみ作成可能。
- **提案**: EditorBubbleMenu に「WikiLink にする」ボタンを追加し、選択テキストを `deleteRange` + `insertContent` で `[[選択テキスト]]` の wikiLink マーク付きテキストに置き換える。既存の WikiLink 挿入処理（useSuggestionEffects）と同じ形式に揃え、必要なら `pageId` を渡して `referenced` も設定する。
- **実装量**: EditorBubbleMenu の変更＋TiptapEditor で `pageId` を渡すだけなので、小〜中規模で実現可能。
