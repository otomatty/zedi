/**
 * 日本語版ウェルカムページの Tiptap ドキュメント。
 * Japanese welcome page Tiptap document.
 */
import type { TiptapNode } from "../../lib/articleExtractor.js";

/**
 * `/pages/:welcomeId` に表示される日本語版ウェルカムページの Tiptap ドキュメント。
 * Japanese welcome page Tiptap document shown at `/pages/:welcomeId`.
 */
export const welcomePageJa: TiptapNode = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Zedi をご利用いただきありがとうございます。本ページではエディターの基本操作をご説明します。自由に編集していただいて構いません。不要になった場合はそのまま削除することもできます。",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "📝 1. テキストを書く" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "以下のデモ動画で、基本的な入力の流れをご覧いただけます。" }],
    },
    {
      type: "video",
      attrs: {
        src: "/welcome-media/markdown-demo.webm",
        alt: "Markdown 記法で見出しや太字、リストを入力するデモ動画",
        poster: null,
      },
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "本エディターは、" },
        { type: "text", marks: [{ type: "bold" }], text: "Markdown 記法で書く方法" },
        { type: "text", text: "と、" },
        { type: "text", marks: [{ type: "bold" }], text: "選択メニューから操作する方法" },
        {
          type: "text",
          text: "の 2 通りに対応しています。Markdown 記法を覚えていなくても、お好みの方法でご利用いただけます。",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Markdown 記法で書く" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "よく使う記法の一覧です。入力すると自動的に変換されます。" }],
    },
    {
      type: "bulletList",
      content: [
        markdownRow("# 見出し", " → 大見出し"),
        markdownRow("## 見出し", " → 中見出し"),
        markdownRow("**太字**", " → 太字"),
        markdownRow("*斜体*", " → 斜体"),
        markdownRow("- 項目", " → 箇条書きリスト"),
        markdownRow("1. 項目", " → 番号付きリスト"),
        markdownRow("- [ ] タスク", " → チェックリスト"),
        markdownRow("`code`", " → インラインコード"),
        markdownRow("> 引用", " → 引用ブロック"),
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "選択メニューから操作する" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "テキストを選択するとメニューが表示されます。太字・斜体・リスト化などをクリックで適用できます。",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "⚡ 2. スラッシュコマンド" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "スラッシュコマンドを使った入力の流れをご覧ください。" }],
    },
    {
      type: "video",
      attrs: {
        src: "/welcome-media/slash-commands-demo.webm",
        alt: "スラッシュコマンドで見出しやリストを挿入するデモ動画",
        poster: null,
      },
    },
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "code" }], text: "/" },
        {
          type: "text",
          text: " を入力するとブロック挿入メニューが表示されます。見出し、リスト、画像、動画、コードブロックなどを選択して挿入できます。",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "📚 3. もっと詳しく知る" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Wiki リンク " },
        { type: "text", marks: [{ type: "code" }], text: "[[" },
        {
          type: "text",
          text: " の使い方、画像・ファイルの挿入、AI との連携などの詳細は、公式ノート「",
        },
        {
          type: "text",
          marks: [
            { type: "link", attrs: { href: "/notes/official-guide?lang=ja", target: "_self" } },
          ],
          text: "Zedi の使い方",
        },
        { type: "text", text: "」をご参照ください。" },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "✏️ 自由に編集してください" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "このページは、操作を試していただく場としてご利用いただけます。見出しを追加したり、リストを書き足したりして、操作に慣れてみてください。不要になった場合は、ページ右上のメニューから削除することもできます。",
        },
      ],
    },
  ],
};

/**
 * Markdown 記法 → 効果の 1 行を bullet list 項目として組み立てるヘルパー。
 * Helper that builds a bullet-list item mapping a Markdown syntax to its effect.
 */
function markdownRow(code: string, effect: string): TiptapNode {
  return {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "code" }], text: code },
          { type: "text", text: effect },
        ],
      },
    ],
  };
}
