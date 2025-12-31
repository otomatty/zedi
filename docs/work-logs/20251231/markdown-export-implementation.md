# Markdown エクスポート機能の実装

## 日付

2025 年 12 月 31 日

## 概要

ページの内容を Markdown ファイルとしてエクスポートする機能を実装しました。

## 実装内容

### 1. Markdown 変換ユーティリティ (`src/lib/markdownExport.ts`)

Tiptap JSON から Markdown への変換機能を新規作成しました。

#### 対応要素

- **見出し**: H1〜H3
- **リスト**: 箇条書き、番号付き（ネスト対応）
- **引用**: blockquote
- **コードブロック**: 言語指定付き
- **水平線**: `---`
- **テキスト装飾**:
  - 太字 (`**text**`)
  - 斜体 (`*text*`)
  - 取り消し線 (`~~text~~`)
  - インラインコード (`` `code` ``)
- **リンク**: `[text](url)`
- **画像**: `![alt](src)`
- **WikiLink**: `[[リンクテキスト]]` 形式を保持

#### エクスポート関数

- `tiptapToMarkdown(content: string)`: Tiptap JSON を Markdown 文字列に変換
- `downloadMarkdown(title: string, content: string)`: Markdown ファイルとしてダウンロード
- `copyMarkdownToClipboard(title: string, content: string)`: クリップボードにコピー

### 2. UI 統合 (`src/components/editor/PageEditorView.tsx`)

ページ編集画面の右上メニュー（⋯ ボタン）に以下のオプションを追加：

| メニュー項目            | アイコン | 機能                                   |
| :---------------------- | :------- | :------------------------------------- |
| Markdown でエクスポート | Download | `.md`ファイルとしてダウンロード        |
| Markdown をコピー       | Copy     | クリップボードに Markdown 形式でコピー |

### 3. ファイル名の処理

- ページタイトルをファイル名として使用
- 無効な文字（`<>:"/\|?*`）はアンダースコアに置換
- スペースはアンダースコアに置換
- 最大 100 文字に制限
- タイトルが空の場合は「無題のページ」を使用

## 出力フォーマット

エクスポートされる Markdown は以下の形式：

```markdown
# ページタイトル

（本文の Markdown 変換結果）
```

## 変更ファイル

| ファイル                                   | 変更内容                 |
| :----------------------------------------- | :----------------------- |
| `src/lib/markdownExport.ts`                | 新規作成                 |
| `src/components/editor/PageEditorView.tsx` | エクスポートメニュー追加 |

## PRD 対応

Phase 5「Polish & Ecosystem」の「エクスポート機能（Markdown）」を実装完了としてマーク。

## 今後の拡張候補

- 複数ページの一括エクスポート
- フォルダ構造を含むエクスポート（ZIP 形式）
- フロントマター（YAML）の追加オプション
- Obsidian 互換フォーマットオプション
