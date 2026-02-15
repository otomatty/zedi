# Tiptap エディター拡張機能 実装計画書

**作成日:** 2026-02-15  
**対象:** スラッシュコマンド（/）・タスクリスト・ハイライト・下線・テーブル・文字色・数式・Mermaid（ダイアグラム）  
**参照:** [TiptapEditor](../src/components/editor/TiptapEditor.tsx)、[editorConfig](../src/components/editor/TiptapEditor/editorConfig.ts)、[contentUtils](../src/lib/contentUtils.ts)

---

## 1. 目的と対象機能

Tiptap エディターに以下の記法・機能を追加し、ノート／Wiki の表現力と利便性を高める。  
あわせて **スラッシュコマンド（/）** により、Markdown 記法のベースとなるブロックをメニューから挿入できるようにする。

| # | 機能 | 概要 | 優先度 |
|---|------|------|--------|
| 0 | **スラッシュコマンド（/）** | `/` 入力で挿入可能なブロック一覧を表示し、選択で該当ブロックを挿入。Markdown 記法の「入力の入口」として利用。 | 高 |
| 1 | タスクリスト | チェックボックス付きリスト（`- [ ]` / `- [x]`） | 高 |
| 2 | ハイライト | テキストのマーカー強調（`==text==`） | 高 |
| 3 | 下線 | アンダーライン（`<u>`） | 高 |
| 4 | テーブル | 表の挿入・編集（行/列の追加・削除） | 高 |
| 5 | 文字色 | テキスト色・背景色の指定 | 中 |
| 6 | 数式 | LaTeX によるインライン/ブロック数式（KaTeX） | 中 |
| 7 | **コードブロック（シンタックスハイライト）** | 言語選択付きコードブロック。GitHub と同様の配色でシンタックスハイライトを表示。 | 高 |
| 8 | **Mermaid（ダイアグラム）** | 既存の Mermaid 拡張。スラッシュメニュー「ダイアグラム」で挿入。フローチャート等の図を記法で記述。 | 高（既存） |

---

## 2. 依存パッケージ

### 2.1 追加する npm パッケージ

既存の Tiptap は `^3.18.0` を使用。同一メジャー内で `^3.18.0` に揃える。

| パッケージ | 用途 | 備考 |
|------------|------|------|
| `@tiptap/extension-task-list` | タスクリスト | `@tiptap/extension-list` に依存（StarterKit に含まれる list と共存） |
| `@tiptap/extension-task-item` | タスク項目（チェックボックス） | task-list に含まれる場合あり。要確認。 |
| `@tiptap/extension-highlight` | ハイライト | 単体で利用可能 |
| `@tiptap/extension-underline` | 下線 | 単体で利用可能 |
| `@tiptap/extension-table` | テーブル | table, tableRow, tableCell, tableHeader |
| `@tiptap/extension-table-row` | テーブル行 | extension-table に含まれるか要確認 |
| `@tiptap/extension-table-cell` | テーブルセル | 同上 |
| `@tiptap/extension-table-header` | テーブルヘッダー | 同上 |
| `@tiptap/extension-text-style` | 文字スタイル基盤 | 文字色の前提。`color` 属性を扱う土台 |
| `@tiptap/extension-color` | 文字色 | TextStyle に依存 |
| `@tiptap/extension-mathematics` | 数式（LaTeX） | インライン/ブロック両対応 |
| `katex` | 数式レンダリング | Mathematics が使用。CSS の import が必要 |
| `@tiptap/suggestion` | スラッシュコマンド用（任意） | トリガー文字 `/` とサジェスト UI を統合。カスタムプラグインで代替可。 |
| `lowlight` | コードブロックのシンタックスハイライト | highlight.js の文法を利用。CodeBlockLowlight に渡す。 |
| `@tiptap/extension-code-block-lowlight` | シンタックスハイライト付きコードブロック | 既存の CodeBlock（StarterKit）を差し替える。 |
| `highlight.js`（テーマ CSS のみ利用可） | GitHub 風配色 | `github` / `github-dark` テーマの CSS。npm では `highlight.js` または CDN から取得。 |

**インストール例:**

```bash
bun add @tiptap/extension-task-list @tiptap/extension-task-item \
  @tiptap/extension-highlight @tiptap/extension-underline \
  @tiptap/extension-table @tiptap/extension-text-style \
  @tiptap/extension-color @tiptap/extension-mathematics katex \
  lowlight @tiptap/extension-code-block-lowlight highlight.js
```

※ `@tiptap/extension-table` が tableRow / tableCell / tableHeader をまとめて提供するか、別パッケージかは公式ドキュメントで要確認。必要に応じて `@tiptap/extension-table-row` 等を追加。

---

## 3. 実装フェーズと順序

依存関係とテストしやすさを考慮し、以下の順で実装する。

| フェーズ | 内容 | 理由 |
|----------|------|------|
| **Phase 0** | **スラッシュコマンド（/）** | `/` でブロック挿入メニューを表示。Markdown 記法の「入力の入口」として、他フェーズで追加するブロックをメニューから挿入できるようにする。先に実装すると、以降のブロック追加時にメニュー項目を足すだけでよい。 |
| **Phase 1** | タスクリスト・ハイライト・下線・**コードブロック（シンタックスハイライト）** | 単純な拡張追加＋コードブロックを CodeBlockLowlight に差し替え。サニタイザ・CSS・Bubble Menu を共通化。スラッシュメニューに「タスクリスト」「ハイライト」「コードブロック」等を追加。 |
| **Phase 2** | テーブル | ノードが複数（table, tableRow, tableCell, tableHeader）。挿入 UI が必要。スラッシュメニューに「テーブル」を追加。 |
| **Phase 3** | 文字色 | TextStyle + Color。カラーピッカーまたはプリセット UI が必要。 |
| **Phase 4** | 数式 | KaTeX の読み込み・CSS。インライン/ブロック挿入と編集ダイアログ。スラッシュメニューに「数式」を追加。 |

---

## 4. 共通作業（全フェーズで実施）

### 4.1 コンテンツサニタイザの更新

**ファイル:** `src/lib/contentUtils.ts`

追加するノード型・マーク型を許可リストに追加する。

**SUPPORTED_NODE_TYPES に追加:**

- `taskList`, `taskItem`（Phase 1）
- `table`, `tableRow`, `tableCell`, `tableHeader`（Phase 2）
- （数式は Tiptap Mathematics のノード名を確認の上で追加。例: `inlineMath`, `blockMath` など）（Phase 4）

**SUPPORTED_MARK_TYPES に追加:**

- `highlight`（Phase 1）
- `underline`（Phase 1）
- （文字色は `textStyle` と `color` など、拡張が使うマーク名を公式ドキュメントで確認して追加）（Phase 3）

**注意:** 既存コンテンツに未知のノード/マークが含まれるとサニタイザで削除され、`onContentError` で通知される。新規ノード/マーク追加時は必ずここを更新する。

### 4.2 テストの更新

**ファイル:** `src/lib/contentUtils.test.ts`

- `contentWithAllNodes` / `contentWithAllMarks` に新しいノード・マークを 1 件ずつ含め、サニタイザが削除しないことを確認するテストを追加する。
- 既存の「未対応ノードを削除する」テストで、新ノードを「未対応」として扱っていないか確認する。

---

## 5. Phase 0: スラッシュコマンド（/）

ユーザーが **`/`（スラッシュ）** を入力したときに、挿入可能なブロック（Markdown 記法のベースとなる要素）の一覧を表示し、選択した項目で該当ブロックを挿入する機能とする。Notion や Slack のスラッシュコマンドと同様の UX を目指す。

### 5.1 挙動（仕様確定）

- **トリガー:** 次のいずれかのとき `/` でメニューを表示する。（1）行の先頭で `/` を入力したとき。（2）直前に半角スペースがあり、その直後に `/` を入力したとき（文中でも「 … /」となっていればメニューが開く）。
- **メニュー内容:** 挿入可能なブロック種別の一覧。各項目にタイトル・短い説明・アイコン（任意）を表示。
- **フィルタ:** `/` の続きで文字を入力すると、タイトル・エイリアスでフィルタする（例: `/ta` → テーブル・タスクリスト、`/見出` → 見出し1〜3）。
- **選択:** マウスクリックまたはキーボード（↑↓で移動、Enter で確定）。選択時にトリガー文字を含む範囲を削除し、該当ブロックを挿入する。
- **キャンセル:** Escape でメニューを閉じる。**`/` を含むトリガー範囲はそのまま残す**（削除しない）。
- **実装方針:** **カスタムプラグイン**（WikiLink と同様の SlashSuggestionPlugin + SlashSuggestionLayer）で実装する。

### 5.2 メニュー項目（挿入できる要素）

以下をスラッシュメニューの項目として用意する。Phase 1〜4 で追加するブロックは、対応する拡張実装後に項目を追加する。

| 項目（表示名） | エイリアス（検索用） | 挿入内容 | 備考 |
|----------------|----------------------|----------|------|
| 段落 | 段落, paragraph, p | 空の段落 | 現在のブロックを段落に変換 |
| 見出し1 | 見出し1, h1, 大見出し | `heading` level 1 | |
| 見出し2 | 見出し2, h2 | `heading` level 2 | |
| 見出し3 | 見出し3, h3 | `heading` level 3 | |
| 箇条書き | 箇条書き, ul, リスト, bullet | `bulletList` + `listItem` | |
| 番号付きリスト | 番号, ol, 順序付き | `orderedList` + `listItem` | |
| タスクリスト | タスク, todo, チェック | `taskList` + `taskItem`（Phase 1 で追加） | |
| 引用 | 引用, blockquote, quote | `blockquote` | |
| コードブロック | コード, code, pre | `codeBlock` | |
| 水平線 | 区切り線, hr, 水平 | `horizontalRule` | |
| テーブル | テーブル, 表, table | 3x3 等のテーブル（Phase 2 で追加） | |
| 画像 | 画像, image, img | 画像挿入（ファイル選択ダイアログを開く） | 既存の `handleInsertImageClick` と連携 |
| ダイアグラム（Mermaid） | ダイアグラム, mermaid, 図 | 空の Mermaid ブロック。既存の Mermaid 拡張と連携。テキスト選択後にダイアグラム生成も利用可。 | 記法として Mermaid を明示的にサポート |
| 数式（インライン） | 数式, math, インライン | 空のインライン数式ノード（Phase 4 で追加） | |
| 数式（ブロック） | 数式ブロック, block math | 空のブロック数式ノード（Phase 4 で追加） | |

エイリアスは日本語・英語の両方で検索できるようにする。

### 5.3 実装方針

**方針 A: `@tiptap/suggestion` を利用する**

- パッケージ: `@tiptap/suggestion`（`char: '/'`、または `findSuggestionMatch` で `/` のみ／行頭のみなどを制御）。
- `items`: 上記メニュー項目の配列。`onSelect` で `editor.chain().focus().deleteRange({ from, to }).insertContent(...).run()` のようにトリガー範囲を削除してから該当ブロックを挿入する。
- サジェスト用の React コンポーネント（ポップオーバー）は、既存の **WikiLinkSuggestionLayer** と同様に、状態に応じて表示位置を計算し、リストを描画する。キーボード（Escape / Arrow / Enter）は Suggestion の `onKeyDown` で処理する。

**方針 B: カスタムプラグイン（WikiLink と同様）**

- 既存の **WikiLinkSuggestionPlugin** と同様に、ProseMirror の Plugin で「`/` の直後」を検知し、`range` と `query`（`/` 以降の文字列）を state に持つ。
- 別コンポーネント **SlashSuggestionLayer** で、`query` でフィルタしたメニュー項目を表示。選択時に `editor.chain().focus().deleteRange({ from, to }).insertContent(...).run()` を実行し、その後プラグインに `close: true` の meta を dispatch してメニューを閉じる。
- キーボード処理は TiptapEditor の `editorProps.handleKeyDown` で、スラッシュサジェスト用の ref に委譲（WikiLink と同様）。

**決定:** 方針 B（カスタムプラグイン）で実装する。

### 5.4 技術メモ

- **トリガー位置:** 行の先頭、または直前に半角スペースがある場合のみ有効（仕様確定）。それ以外の文中の `/` はメニューを開かずそのまま入力される。
- **WikiLink との競合:** `[[` と `/` は別パターンなので、同時に有効で問題ない。同じ `handleKeyDown` 内で、スラッシュ用 state が active なときはスラッシュ用ハンドラを、WikiLink 用 state が active なときは WikiLink 用ハンドラを呼ぶ分岐にする。
- **コラボレーション:** スラッシュメニューはクライアント側の UI のみ。挿入される内容は Y.js 経由で同期されるため、既存の Collaboration 拡張の範囲で動作する想定。

### 5.5 成果物（予定）

| 成果物 | 説明 |
|--------|------|
| **SlashSuggestionPlugin** | `src/components/editor/extensions/slashSuggestionPlugin.ts`。`/` 検知と state（active, query, range）、decorations、close meta。 |
| **SlashSuggestionLayer** | `src/components/editor/TiptapEditor/SlashSuggestionLayer.tsx`。メニュー項目の表示・フィルタ・選択・キーボード用 ref。 |
| **slashCommandItems** | メニュー項目の定義（タイトル・エイリアス・挿入処理）。`src/components/editor/TiptapEditor/slashCommandItems.ts` または editorConfig 内に配列として持つ。 |
| **TiptapEditor.tsx** | SlashSuggestionPlugin を extension に追加。SlashSuggestionLayer を配置。handleKeyDown でスラッシュ用 ref を呼ぶ分岐を追加。 |

---

## 6. Phase 1: タスクリスト・ハイライト・下線

### 6.1 タスクリスト

- **パッケージ:** `@tiptap/extension-task-list`, `@tiptap/extension-task-item`（または List パッケージに含まれるか確認）
- **editorConfig.ts:**
  - `TaskList`, `TaskItem` を import し、`createEditorExtensions` の返り配列に追加。
  - StarterKit の `bulletList` / `orderedList` / `listItem` と競合しないか確認（通常は並列で問題なし）。
- **キーボード:** デフォルトでタスクリスト用のショートカットがあるか公式ドキュメントで確認。必要なら `Mod-Shift-9` 等を設定。
- **入力ルール:** `- [ ] ` や `- [x] ` でタスクリストに変換する入力ルールが拡張に含まれるか確認。含まれなければカスタムで追加検討。
- **CSS（index.css）:**
  - `.tiptap-editor ul[data-type="taskList"]` でリストスタイルを `list-style: none` に。
  - `.tiptap-editor li[data-type="taskItem"]` でチェックボックスとラベルを配置。既存の `li` と区別する。

### 6.2 ハイライト

- **パッケージ:** `@tiptap/extension-highlight`
- **editorConfig.ts:** `Highlight` を追加。必要に応じて `HTMLAttributes` でクラス指定（例: `bg-yellow-200` または `highlight`）。
- **入力ルール:** `==text==` でハイライトにする入力ルールが拡張に含まれるか確認。
- **CSS:** `.tiptap-editor mark` または `.tiptap-editor .highlight` で背景色を指定。

### 6.3 下線

- **パッケージ:** `@tiptap/extension-underline`
- **editorConfig.ts:** `Underline` を追加。デフォルトで `Ctrl+U` / `Cmd+U` が割り当たるか確認。
- **CSS:** 必要に応じて `.tiptap-editor u` のスタイルを調整。

### 6.4 Phase 1 の UI（ツールバー）— 仕様確定

- **書式 UI:** **Bubble Menu** を使用する。テキスト選択時に表示する浮きメニューで、`@tiptap/extension-bubble-menu` を利用した新規コンポーネント `EditorBubbleMenu.tsx` を TiptapEditor の `EditorContent` 直下に配置する。
- **Bubble Menu に含める項目:** 太字・イタリック・ハイライト・タスクリスト・箇条書きリスト・番号付きリスト・文字色。下線はエディター拡張としては有効にするが、Bubble Menu のボタンには含めない（必要なら後から追加可）。

### 6.5 コードブロックのシンタックスハイライト

コードブロックに**言語選択**と**シンタックスハイライト**を追加し、GitHub と同様の配色で表示する。

#### 6.5.1 拡張の差し替え（仕様確定）

- **現状:** StarterKit に含まれる `CodeBlock` はハイライトなしのプレーンな `<pre><code>` を出力する。
- **対応:** StarterKit の `codeBlock: false` で無効化し、**CodeBlockLowlight** を追加する。
- **パッケージ:** `@tiptap/extension-code-block-lowlight`, `lowlight`
- **editorConfig.ts:** `StarterKit.configure({ ..., codeBlock: false })`、`CodeBlockLowlight.configure({ lowlight })` で lowlight インスタンスを渡す。
- **lowlight の言語セット:** 標準は **`common`**（37 言語）を使用する。それ以外の言語は、**今後実装予定の拡張機能**で lowlight に `register` を呼ぶ形で追加できるようにする（共通の lowlight インスタンスを拡張可能な形で保持する）。

#### 6.5.2 言語選択 UI（仕様確定）

- **言語未指定時:** 言語が指定されていないコードブロックは **プレーンテキスト** として表示する（`defaultLanguage: 'plaintext'` とする）。
- **言語選択 UI:** **C 案（両方対応）**。ブロック選択時のドロップダウンで既存ブロックの言語を変更し、スラッシュメニューで「コードブロック」挿入時にも言語を指定できるようにする。
- **言語リスト:** **common の全言語**をユーザーに表示する一覧とする。表示名は「JavaScript」「TypeScript」「Plain text」などユーザー向けラベルにし、値は lowlight の言語名に対応させる。

#### 6.5.3 GitHub 風配色（テーマ CSS）— 仕様確定

- **lowlight** は highlight.js の文法を使い、出力に **`hljs-*`** クラスを付与する。highlight.js のテーマ CSS をそのまま利用する。
- **テーマ:** **ライトとダークの両方に対応**し、**アプリのテーマに応じて切り替える**。ライト時は `github.css`、ダーク時は `github-dark.css` または `github-dark-dimmed.css` を、アプリのテーマ状態に合わせて読み込みまたはクラスで切り替える。
- **CSS の読み込み:** npm の `highlight.js/styles/` から読み込む。スコープは `.tiptap-editor` 内に限定し、既存の pre/code スタイルと競合しないようにする。

#### 6.5.4 既存データとの互換性

- 既存の `codeBlock` ノードはノード型名が同じため CodeBlockLowlight でそのまま表示される。`language` 属性が無い場合はプレーンテキストとして表示する（上記仕様）。
- サニタイザ: ノード型は `codeBlock` のままなので SUPPORTED_NODE_TYPES の変更は不要。

#### 6.5.5 成果物（予定）

| 成果物 | 説明 |
|--------|------|
| `editorConfig.ts` | StarterKit の `codeBlock: false`、CodeBlockLowlight の追加、lowlight インスタンス（`createLowlight(common)`）の渡し方 |
| 言語リスト | 言語選択用の「表示名 ⇔ lowlight 言語名」のマッピング。定数ファイルまたは editorConfig 付近に定義。 |
| **CodeBlockLanguageSelect**（任意） | コードブロック選択時に表示する言語ドロップダウンコンポーネント。NodeView のツールバーまたは Bubble Menu で表示。 |
| `index.css` または別 CSS | `highlight.js/styles/github.css` の import。ダークモード時は `github-dark.css` を条件付きで読み込む。 |

---

## 7. Phase 2: テーブル（仕様確定）

### 7.1 拡張の追加

- **パッケージ:** `@tiptap/extension-table`（必要に応じて table-row / table-cell / table-header を公式ドキュメントで確認）。
- **editorConfig.ts:** Table 関連の拡張をすべて追加。順序は公式推奨に従う。
- **Markdown テーブルの取り込み:** **Markdown 形式のテーブル**（`| a | b |` のような行）がペーストまたはインポートされた場合、**自動的に Tiptap のテーブルノードに変換**できるようにする。入力ルールまたはペーストハンドラで対応する。

### 7.2 テーブル用 UI（仕様確定）

- **デフォルト挿入サイズ:** **3×3** で、**1 行目をヘッダー行**（`tableHeader`）として作成する。
- **挿入場所:** **Bubble Menu** に「テーブル」を追加し、**スラッシュメニュー**にも「テーブル」項目を追加する。両方から挿入可能にする。
- **編集:** セル選択時に、行の追加・削除・列の追加・削除等を行うメニュー（テーブル用 Bubble Menu または専用メニュー）。Tiptap の `addRowBefore`, `addRowAfter`, `deleteRow`, `addColumnBefore`, `addColumnAfter`, `deleteColumn`, `toggleHeaderRow`, `toggleHeaderColumn` 等を利用する。

### 7.3 テーブルのスタイル・サイズ（仕様確定）

- **最大サイズ:** 行・列の上限は**設けない**。サイズが大きくなった場合は、テーブルを包むラッパーで **横スクロール** できるようにする（`overflow-x: auto` 等）。
- **index.css:** `.tiptap-editor table`, `th`, `td` のボーダー・パディング・セル幅を定義。既存スタイルと統一する。

### 7.4 サニタイザ

- ノード型: `table`, `tableRow`, `tableCell`, `tableHeader` を追加。

---

## 8. Phase 3: 文字色（仕様確定）

### 8.1 拡張の追加

- **パッケージ:** `@tiptap/extension-text-style`, `@tiptap/extension-color`
- **editorConfig.ts:** まず `TextStyle`、その次に `Color` を追加（順序を守る）。
- **背景色:** Phase 3 では**文字色のみ**対応する。背景色（ハイライト色）は別拡張で検討する。

### 8.2 文字色の UI（仕様確定・プリセット提案）

- **UI:** **プリセットカラーのみ**を使用する。Bubble Menu に「文字色」ドロップダウンまたはポップオーバーを設け、プリセット色を並べてクリックで `setColor('#hex')` を実行する。
- **プリセット色の提案:** 可読性と汎用性を考慮した 8〜10 色程度を推奨。例（HEX）:
  - 黒 `#1a1a1a`、グレー `#6b7280`、赤 `#dc2626`、オレンジ `#ea580c`、緑 `#16a34a`、青 `#2563eb`、紫 `#7c3aed`、ピンク `#db2777`。必要に応じて「デフォルト（黒）」で `unsetColor()` を実行する項目を先頭に置く。
- **背景色:** 上記の通り Phase 3 では対応しない。将来的に背景色を追加する場合は、同じプリセットパレットを背景用として流用するか、`@tiptap/extension-highlight` の色指定や別拡張で検討する。

### 8.3 サニタイザ

- マーク型: `textStyle`, `color`（公式拡張が使う名前を確認）を SUPPORTED_MARK_TYPES に追加する。

---

## 9. Phase 4: 数式（仕様確定）

### 9.1 拡張の追加

- **パッケージ:** `@tiptap/extension-mathematics`, `katex`
- **CSS:** エントリで `import 'katex/dist/katex.min.css'` を実行。
- **editorConfig.ts:** `Mathematics` を設定。`inlineOptions` / `blockOptions` の `onClick` で、クリック時に編集用ダイアログを開く。

### 9.2 数式の編集 UI（仕様確定）

- **編集 UI:** **専用ダイアログ**を表示して編集する。既存の MermaidGeneratorDialog と同様のパターンで `MathEditDialog.tsx` を用意し、`updateInlineMath` / `updateBlockMath` で反映する。
- **入力形式:** **LaTeX** をはじめとする一般的な数式記法に対応できるようにする（KaTeX が解釈する LaTeX を主とする）。
- **インライン/ブロック:** 挿入時はスラッシュメニュー等で「数式（インライン）」「数式（ブロック）」を選べるようにし、挿入後はクリックでダイアログを開いて編集する。

### 9.3 KaTeX のオプション

- `katexOptions: { throwOnError: false }` にすると、不正な LaTeX でもエラーで落ちずに表示できる。必要に応じて `macros` で `\R` → `\mathbb{R}` 等を登録。

### 9.4 サニタイザ

- ノード型: Mathematics 拡張が使うノード名（例: `inlineMath`, `blockMath` または `mathInline`, `mathBlock`）を公式ドキュメントで確認し、SUPPORTED_NODE_TYPES に追加。

### 9.5 既存コンテンツのマイグレーション（任意）

- 既に `$...$` をプレーンテキストで書いているコンテンツがある場合、`migrateMathStrings(editor)` を `onCreate` で実行すると、文字列が数式ノードに変換される。コラボレーション利用時は `provider.on('synced', () => migrateMathStrings(editor))` のように初回同期後に実行する。

---

## 10. ファイル変更一覧（予定）

| ファイル | 変更内容 |
|----------|----------|
| `package.json` | 上記 npm パッケージの追加 |
| `src/components/editor/TiptapEditor/editorConfig.ts` | 各拡張の import と `createEditorExtensions` への追加 |
| `src/lib/contentUtils.ts` | SUPPORTED_NODE_TYPES / SUPPORTED_MARK_TYPES の更新 |
| `src/lib/contentUtils.test.ts` | 新ノード・マークのサニタイズテスト追加 |
| `src/index.css` | タスクリスト・ハイライト・下線・テーブル・数式用の `.tiptap-editor` 内スタイル |
| `src/components/editor/TiptapEditor.tsx` | Bubble Menu 用コンポーネントの配置、数式用ダイアログの状態とハンドラ |
| **新規** `src/components/editor/TiptapEditor/EditorBubbleMenu.tsx` | Bubble Menu：太字・イタリック・ハイライト・タスクリスト・箇条書き・番号付きリスト・文字色・テーブル挿入 |
| **新規** `src/components/editor/TiptapEditor/TableBubbleMenu.tsx`（任意） | セル選択時のテーブル操作メニュー |
| **新規** `src/components/editor/TiptapEditor/MathEditDialog.tsx` | 数式（LaTeX）編集ダイアログ |
| `src/main.tsx`（または TiptapEditor 内） | `import 'katex/dist/katex.min.css'` |
| **新規** `src/components/editor/extensions/slashSuggestionPlugin.ts` | スラッシュ（/）検知プラグイン（Phase 0） |
| **新規** `src/components/editor/TiptapEditor/SlashSuggestionLayer.tsx` | スラッシュメニュー UI（Phase 0） |
| **新規** `src/components/editor/TiptapEditor/slashCommandItems.ts`（または editorConfig 内） | スラッシュメニュー項目定義（Phase 0） |
| lowlight 初期化（common または all） | editorConfig または専用ファイルで `createLowlight(common)` を渡す（Phase 1） |
| **新規** `src/components/editor/TiptapEditor/CodeBlockLanguageSelect.tsx`（任意） | コードブロック用言語ドロップダウン（Phase 1） |
| `src/index.css` またはエントリ | `highlight.js/styles/github.css`（および任意で `github-dark.css`）の import（Phase 1） |

---

## 11. テスト観点

- **単体:** contentUtils のサニタイザで、新ノード・マークを含む JSON が削除されずに通過すること。
- **結合:** 各機能を有効にした状態で、該当する記法で入力 → 保存 → 再読み込みしても内容が保持されること。
- **コードブロック:** 言語を選択したコードブロックでシンタックスハイライトが表示されること。既存の codeBlock コンテンツが CodeBlockLowlight 読み込み後も欠損せず表示されること。
- **スラッシュコマンド:** `/` 入力でメニュー表示 → フィルタ → 選択でブロック挿入まで一連の流れが動作すること。WikiLink の `[[` と同時に開いた場合の競合がないこと。
- **コラボレーション:** Y.js コラボ有効時、タスクリスト・テーブル・数式ノードが他ユーザーと同期するか（既存の Collaboration 拡張の範囲内で動作するか）。
- **アクセシビリティ:** タスクリストのチェックボックスに `aria-label`、テーブルに適切な見出しスコープ、数式に `aria-label` や代替テキストがあるか。スラッシュメニューはキーボード操作とスクリーンリーダー対応を考慮する。

---

## 12. リスク・注意点

- **StarterKit との重複:** TaskList / TaskItem が StarterKit の List と競合しないか、公式ドキュメントと実機で確認する。必要なら StarterKit の `bulletList` を無効にせず、TaskList を追加する形でよい。
- **テーブルとコラボ:** テーブルのセル編集が Y.js で正しくマージされるか、既存の Collaboration で問題が出ないか確認する。
- **数式のバンドルサイズ:** KaTeX はそこそこ大きい。動的 import（`import('katex')`）で数式挿入時のみ読み込む検討は、実装コストと相談。
- **既存コンテンツ:** サニタイザで「未知のノード」として削除されないよう、必ず SUPPORTED_* を先行して更新する。
- **スラッシュと WikiLink:** `/` と `[[` の両方が有効なとき、`handleKeyDown` でどちらの state が active かを判定し、適切なハンドラにだけ委譲する。競合で両方反応しないようにする。
- **コードブロック差し替え:** StarterKit の `codeBlock: false` を忘れずに指定する。さもないと CodeBlock と CodeBlockLowlight が二重に登録され競合する。lowlight の `common` と `all` はバンドルサイズが異なるため、必要な言語だけ登録するか `common` で足りるか検討する。

---

## 13. 完了条件（チェックリスト）

- [ ] **Phase 0:** `/` 入力でスラッシュメニューが表示され、項目選択で該当ブロックが挿入される。フィルタ（例: `/ta`）とキーボード操作（↑↓・Enter・Escape）が動作する。
- [ ] Phase 1: タスクリスト・ハイライト・下線がエディターで利用可能。Bubble Menu でトグルできる。スラッシュメニューに「タスクリスト」等が含まれる。
- [ ] Phase 1（コードブロック）: CodeBlockLowlight によりシンタックスハイライトが有効。言語選択で GitHub 風（github テーマ）の配色が適用される。既存の codeBlock コンテンツが問題なく表示される。
- [ ] Phase 2: テーブルの挿入・行/列の追加・削除が可能。スタイルが他ブロックと調和している。スラッシュメニューに「テーブル」が含まれる。
- [ ] Phase 3: 文字色を選択して適用・解除できる。
- [ ] Phase 4: インライン/ブロック数式の挿入・編集・表示が可能。KaTeX の CSS が読み込まれている。スラッシュメニューに「数式」が含まれる。
- [ ] サニタイザとテストが更新され、新ノード・マークが許可されている。
- [ ] 既存の WikiLink・画像・Mermaid・コラボレーションと共存して動作する。
- [ ] Mermaid（ダイアグラム）がスラッシュメニュー「ダイアグラム」から挿入でき、記法として明示的にサポートされている。

---

## 14. その他仕様（提案・未決定項目）

スラッシュコマンド・Bubble Menu・コードブロック・テーブル・文字色・数式に関する仕様は、本ドキュメントの各章（§5〜§9）に反映済みである。以下は、ユーザー体験を考慮した**提案**と、実装時に判断する**未決定項目**をまとめたもの。必要に応じて決定し、本文や別仕様書に反映する。

### 14.1 サニタイザ・エラー表示（提案）

| 項目 | 提案内容 |
|------|----------|
| **未知ノード/マーク削除時の通知** | サニタイズで削除が発生した場合、トストで「一部の書式を削除しました」と簡潔に通知する。同一セッションでの重複通知を避け、過剰にならないようにする。 |

### 14.2 読み取り専用時の挙動（提案）

| 項目 | 提案内容 |
|------|----------|
| **スラッシュメニュー・Bubble Menu・ツールバー** | 読み取り専用（`isReadOnly`）のときは、これらを**非表示**にする。編集不可であることが分かりやすく、誤タップ・誤操作も防げる。既存の `isReadOnly` の扱いと整合させる。 |

### 14.3 アクセシビリティ（提案）

| 項目 | 提案内容 |
|------|----------|
| **タスクリストのチェックボックス** | `aria-label` は状態に応じて「未完了」「完了」など短い文言にする。アプリの言語設定（日本語/英語）に合わせる。Tiptap TaskItem の `a11y.checkboxLabel` オプションで指定する。 |
| **スラッシュメニュー・Bubble Menu** | スラッシュメニューは矢印キーで項目移動・Enter で選択・Escape で閉じる。Bubble Menu の各ボタンはフォーカス可能にし、`aria-label`（例:「太字」「イタリック」）を付与。スクリーンリーダーで操作可能にする。 |
| **数式の代替テキスト** | 数式ノードに `aria-label` で LaTeX ソースの要約または「数式」を付与。編集時はツールチップでソースを表示するのも有効。 |

### 14.4 モバイル（提案）

| 項目 | 提案内容 |
|------|----------|
| **スラッシュメニュー** | モバイルではカーソル（キャレット）付近または画面中央付近に表示。項目数が多いためリストはスクロール可能にする。必要なら「よく使う」項目を上に出す。 |

### 14.5 Markdown インポート/エクスポート（提案）

| 項目 | 提案内容 |
|------|----------|
| **エクスポート** | 既存の `markdownExport` を拡張し、タスクリストは `- [ ]` / `- [x]`、テーブルは `|` 区切り、コードブロックは ` ```言語名 `、数式は `$...$` / `$$...$$` で出力する（GitHub Flavored Markdown に近い形）。 |
| **インポート** | 上記と同じ記法を解釈し、該当する Tiptap ノードに変換する。Markdown テーブルの自動変換は §7 で仕様確定済み。 |

### 14.6 数式の細部（提案）

| 項目 | 提案内容 |
|------|----------|
| **既存 `$...$` のマイグレーション** | オプションとして、`onCreate` で `migrateMathStrings(editor)` を実行。コラボ時は `provider.on('synced', () => migrateMathStrings(editor))` で初回同期後に実行。初期リリースではマイグレーションなしでもよい。 |
| **KaTeX の読み込み** | 初回から静的 import でよい（実装が単純）。バンドルが気になる場合は、数式ノード表示時やダイアログ表示時の動的 import を検討。 |
| **不正 LaTeX の扱い** | `katexOptions: { throwOnError: false }` とし、不正な部分はエラーにせずプレーンテキストとして表示する。 |

---

*以上、Tiptap エディター拡張機能の実装計画書とする。*
