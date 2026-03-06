# AIチャット メッセージ表示スタイル 調査・改善案

## 1. 現状の実装

### 1.1 担当コンポーネント

- `**src/components/ai-chat/AIChatMessage.tsx**`
  - ユーザー／AI メッセージの表示
  - AI メッセージは `getDisplayContent()` でアクションブロックを除去した Markdown を `ReactMarkdown` + `remarkGfm` でレンダリング
  - ラッパー: `className="prose prose-sm dark:prose-invert max-w-none break-words"`

### 1.2 問題点

| 項目                     | 現状                                                                                                  | 仕様（ai-agent-chat-spec §3.1）                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Prose の有効化**       | `tailwind.config.ts` に `@tailwindcss/typography` が未登録のため、`prose` / `prose-sm` が効いていない | Markdown の見出し・リスト・コード・リンクを適切に表示 |
| **コードブロック**       | シンタックスハイライトなし・コピーボタンなし                                                          | シンタックスハイライト + コピーボタン                 |
| **チャット専用スタイル** | なし（prose も未適用のためブラウザデフォルトに近い）                                                  | メッセージバブル内で読みやすい余白・行間・フォント    |

このため「メッセージのスタイルが読みにくい」という体感になっている。

### 1.3 関連ファイル

- `tailwind.config.ts` … 現状 `plugins: [tailwindcssAnimate]` のみ（typography 未使用）
- `src/index.css` … `highlight.js/styles/github-dark.css` を import 済み（エディタ用）。チャットの ReactMarkdown では未使用
- エディタは `.tiptap-editor` で見出し・リスト・コード・表などを細かくスタイル定義済み

---

## 2. 改善方針

1. **Tailwind Typography の有効化**
   `tailwind.config.ts` に `@tailwindcss/typography` を追加し、`prose` を効かせる。
2. **チャット用 Prose の調整**
   AI メッセージ用に、見出しサイズ・段落余白・行間・コードブロック余白などを抑えつつ、バブル内で読みやすいスタイルを追加（`index.css` の `.ai-chat-markdown` など）。
3. **コードブロック**

- `rehype-highlight` でシンタックスハイライト（既存の highlight.js を利用）
- `<pre>` をラップするコンポーネントで「コピー」ボタンを追加

4. **リンク・リスト・見出し**

- リンクはテーマの `--link-color` に合わせる
- リスト・見出しは prose の上書きで、チャット内で適度なサイズ・余白に収める

---

## 3. 実装タスク（実施済み／推奨）

- `tailwind.config.ts` に `@tailwindcss/typography` を追加
- `index.css` に `.ai-chat-markdown` を追加し、見出し・p・ul/ol・code/pre・a・表のスタイルを定義
- `AIChatMessage.tsx` の AI メッセージ部分を `ai-chat-markdown` でラップ
- `rehype-highlight` を利用し、`ReactMarkdown` の `rehypePlugins` に追加
- コードブロック用のカスタム `components.pre`（`CodeBlockWithCopy`）でコピーボタン付きラッパーを実装

---

## 4. 参考

- 仕様: `docs/specs/ai-agent-chat-spec.md` §3.1 メッセージエリア
- エディタの Markdown スタイル: `src/index.css` の `.tiptap-editor` 系
