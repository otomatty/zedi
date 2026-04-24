/**
 * 英語版ウェルカムページの Tiptap ドキュメント。
 * English welcome page Tiptap document.
 */
import type { TiptapNode } from "../../lib/articleExtractor.js";

/**
 * English welcome page Tiptap document shown at `/pages/:welcomeId`.
 */
export const welcomePageEn: TiptapNode = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Thank you for choosing Zedi. This page walks you through the basics of the editor. Please feel free to edit it as you explore, and delete it whenever you no longer need it.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "📝 1. Writing Text" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "The short demo below shows the basic typing flow." }],
    },
    {
      type: "video",
      attrs: {
        src: "/welcome-media/markdown-demo.webm",
        alt: "Demo: entering headings, bold text, and lists using Markdown shortcuts",
        poster: null,
      },
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Zedi supports two ways of formatting text: " },
        { type: "text", marks: [{ type: "bold" }], text: "Markdown shortcuts" },
        { type: "text", text: " and the " },
        { type: "text", marks: [{ type: "bold" }], text: "selection toolbar" },
        {
          type: "text",
          text: ". You can work comfortably with whichever approach suits you — no prior Markdown knowledge required.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Using Markdown shortcuts" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Here are the most common shortcuts. They convert automatically as you type.",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        markdownRow("# Heading", " → Large heading"),
        markdownRow("## Heading", " → Medium heading"),
        markdownRow("**bold**", " → Bold text"),
        markdownRow("*italic*", " → Italic text"),
        markdownRow("- item", " → Bullet list"),
        markdownRow("1. item", " → Numbered list"),
        markdownRow("- [ ] task", " → Checklist"),
        markdownRow("`code`", " → Inline code"),
        markdownRow("> quote", " → Block quote"),
      ],
    },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Using the selection toolbar" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Selecting any text reveals a toolbar with formatting actions. Click to apply bold, italic, lists, and more — no keyboard shortcuts required.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "⚡ 2. Slash Commands" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "The following demo shows how slash commands work." }],
    },
    {
      type: "video",
      attrs: {
        src: "/welcome-media/slash-commands-demo.webm",
        alt: "Demo: inserting headings and lists via slash commands",
        poster: null,
      },
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Type " },
        { type: "text", marks: [{ type: "code" }], text: "/" },
        {
          type: "text",
          text: " at any position to open the block insertion menu. You can insert headings, lists, images, videos, code blocks, and many other block types.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "📚 3. Learn More" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "For wiki-style links using " },
        { type: "text", marks: [{ type: "code" }], text: "[[" },
        {
          type: "text",
          text: ", media embedding, AI integration, and other advanced features, please refer to the official guide note, ",
        },
        {
          type: "text",
          marks: [
            { type: "link", attrs: { href: "/notes/official-guide?lang=en", target: "_self" } },
          ],
          text: "Zedi User Guide",
        },
        { type: "text", text: "." },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "✏️ Edit Freely" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This page is yours to experiment with. Add headings, write lists, and try out the features as you become comfortable with the editor. When you no longer need it, simply delete it from the page menu.",
        },
      ],
    },
  ],
};

/**
 * Helper building a bullet-list item mapping a Markdown syntax to its effect.
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
