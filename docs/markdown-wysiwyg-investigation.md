# Markdown WYSIWYG 変換が効かない問題の調査報告

## 調査日

2025年3月4日

## 概要

ユーザーがMarkdown形式で入力した際、リアルタイムにWYSIWYGとして書式が変化しない問題について、実装状況を調査し原因となり得るファイルを特定した。

## 現状の実装状況

### 1. WikiLink（`[[...]]`）が動作する理由

**関連ファイル:**

- `src/lib/contentUtils.ts` - `promoteWikiLinksInNode()`, `splitTextNodeByWikiLinks()`
- `src/components/editor/TiptapEditor/useContentSanitizer.ts` - コンテンツ読み込み時にサニタイズ
- `src/components/editor/extensions/wikiLinkSuggestionPlugin.ts` - `[[` 入力時のデコレーション表示

**動作の流れ:**

1. `contentUtils.sanitizeTiptapContent()` が呼ばれると、内部で `promoteWikiLinksInNode()` が実行される
2. プレーンテキストの `[[ページ名]]` パターンを検出し、`wikiLink` マークを持つTiptap JSONに変換
3. このサニタイズは `useContentSanitizer` 経由で、**content プロパティが変更されるたびに**実行される
4. その結果、コンテンツ読み込み時・保存後の再読み込み時などに WikiLink が正しくスタイル適用される

### 2. 通常のMarkdown（`**太字**`, `*斜体*`, `# 見出し` 等）が変換されない箇所

#### 2.1 TipTapの入力変換（Input Rules / Paste Rules）

**理論上は動作するはず:**

- `@tiptap/extension-bold`: `**text**` 用の `markInputRule`, `markPasteRule` を実装
- `@tiptap/extension-italic`: 同様の入力・ペーストルールを実装
- `@tiptap/extension-heading`: `# `, `## `, `### ` 用の `textblockTypeInputRule` を実装

**想定される制約:**

- Boldの入力ルール正規表現: `/(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/`
  - 行頭または**直前にスペースが必要**（例: ` **bold**` は可、`hello**bold**` は不可）

#### 2.2 Markdown文字列としてコンテンツを「設定」する場合

**現状:**

- `@tiptap/markdown` 拡張が **未導入**（package.json に含まれていない）
- `setContent(markdownString, { contentType: 'markdown' })` のような指定ができない
- マークダウン文字列をそのまま渡すと、HTMLとして解釈されるか、そのままテキストになる

**影響:**

- クリップボードから「Markdownテキスト」を貼り付けても、`contentType: 'markdown'` が使えない
- Wiki生成時は `convertMarkdownToTiptapContent` で自前変換しているため、ここでは変換される

### 3. 変換が関わる主要ファイル

| ファイル                                                    | 役割                                                                                    | 備考                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `src/lib/contentUtils.ts`                                   | WikiLinkのプレーンテキスト → wikiLinkマークへの昇格                                     | **bold/italic/heading には未対応**                 |
| `src/lib/wikiGenerator.ts`                                  | Markdown → Tiptap JSON の変換（`convertMarkdownToTiptapContent`, `parseInlineContent`） | Wiki生成時のみ使用                                 |
| `src/components/editor/TiptapEditor/useContentSanitizer.ts` | content変更時のサニタイズ＋WikiLink昇格の適用                                           | **bold/italic/heading の昇格は行っていない**       |
| `src/components/editor/TiptapEditor/editorConfig.ts`        | StarterKitなどエディタ拡張の定義                                                        | Input/Paste Rules は含まれている                   |
| `src/components/editor/TiptapEditor/useEditorSetup.ts`      | エディタの初期化、`handleKeyDown` の設定                                                | Slash/WikiLinkサジェスト中はキーを横取りする可能性 |

## 想定される原因

### 原因A: contentUtils が Markdown 書式を変換していない

- `contentUtils.sanitizeTiptapContent()` は `promoteWikiLinksInNode()` で WikiLink のみ変換
- **bold, italic, heading, list などは変換対象外**
- コンテンツ読み込み・同期時にこれらがプレーンテキストのままになる経路がある

### 原因B: Markdown文字列の一括設定に対応していない

- `setContent(markdownString)` のようにマークダウンを渡す用途で、`@tiptap/markdown` が未使用
- マークダウンをそのまま渡すと、書式として解釈されずに表示される

### 原因C: Input Rules の実行阻害

- `useEditorSetup` の `handleKeyDown` が、Slash/WikiLink サジェスト表示中に `true` を返し、通常のキー入力を奪う
- その状態で `*` や `#` を入力しても、Input Rules まで届かない可能性

### 原因D: Collaboration（Y.js）の影響

- Y.js バインディング使用時に、トランザクションの適用順や競合で Input Rules が正しく動かない可能性（要検証）

## 次のアクション候補

1. **contentUtils に Markdown 書式の昇格を追加**
   - `promoteWikiLinksInNode` と同様に、`**text**`, `*text*`, `# heading` などを検出してマーク/ノードに変換する処理を追加する

2. **@tiptap/markdown の導入**
   - `setContent(md, { contentType: 'markdown' })` でマークダウンを扱えるようにする
   - 貼り付け時にも `contentType: 'markdown'` を利用する

3. **handleKeyDown の挙動見直し**
   - Slash/WikiLink サジェストがアクティブでないキー（`*`, `#` など）は通常の Input Rules に渡るようにする

4. **Input Rules の挙動確認**
   - `**bold**` が「直前にスペースなし」で効かない制約があるか確認
   - 必要に応じてカスタム Input Rules を追加

## 参照

- [TipTap Input Rules](https://tiptap.dev/docs/editor/api/input-rules)
- [TipTap Markdown Basic Usage](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage)
- [TipTap Markdown Shortcuts Example](https://tiptap.dev/docs/editor/examples/markdown-shortcuts)
