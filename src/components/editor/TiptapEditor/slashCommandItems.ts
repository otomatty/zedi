import type { Editor } from "@tiptap/core";
import i18n from "@/i18n";

/**
 * Check if the current device is a mobile device (phone or tablet).
 * モバイルデバイス（スマートフォン・タブレット）かどうかを判定する。
 */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || "ontouchend" in document;
}

/**
 * One slash-menu entry (paragraph, heading, code block, etc.).
 * スラッシュメニューの 1 項目（段落、見出し、コードブロックなど）。
 */
export interface SlashCommandItem {
  id: string;
  icon: string; // Lucide icon name
  /** Return true if the extension required by this item is available */
  isAvailable?: (editor: Editor) => boolean;
  action: (editor: Editor, range: { from: number; to: number }) => void;
}

type TFunction = (key: string) => string;

/**
 * All slash command items.
 * Title, description, and aliases come from i18n (editor.slash.<id>).
 * Items with `isAvailable` will only show when their extension is registered.
 */
export const slashCommandItems: SlashCommandItem[] = [
  {
    id: "paragraph",
    icon: "Pilcrow",
    action: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    // ページタイトル input が h1 を担うため、本文 schema は `levels: [2, 3, 4, 5]`。
    // ID とラベルは実 level に揃える。
    // The page title input owns the only h1; the body schema allows levels 2–5,
    // so each slash item's id matches the level it inserts.
    id: "heading2",
    icon: "Heading2",
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    id: "heading3",
    icon: "Heading3",
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    id: "heading4",
    icon: "Heading4",
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 4 }).run(),
  },
  {
    id: "heading5",
    icon: "Heading5",
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 5 }).run(),
  },
  {
    id: "bulletList",
    icon: "List",
    action: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "orderedList",
    icon: "ListOrdered",
    action: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "taskList",
    icon: "CheckSquare",
    isAvailable: (editor) =>
      !!editor.extensionManager.extensions.find((e) => e.name === "taskList"),
    action: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "blockquote",
    icon: "Quote",
    action: (editor, range) => editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    id: "codeBlock",
    icon: "Code2",
    action: (editor, range) => editor.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  {
    id: "horizontalRule",
    icon: "Minus",
    action: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: "table",
    icon: "Table",
    isAvailable: (editor) => !!editor.extensionManager.extensions.find((e) => e.name === "table"),
    action: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: "image",
    icon: "ImagePlus",
    isAvailable: (editor) =>
      !!editor.extensionManager.extensions.find((e) => e.name === "mediaPlaceholder"),
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).insertMediaPlaceholder({ mode: "image" }).run(),
  },
  {
    id: "video",
    icon: "FileVideo",
    isAvailable: (editor) =>
      !!editor.extensionManager.extensions.find((e) => e.name === "mediaPlaceholder"),
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).insertMediaPlaceholder({ mode: "video" }).run(),
  },
  {
    id: "camera",
    icon: "Camera",
    isAvailable: () => isMobileDevice(),
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent("slash-command-insert-camera-image"));
    },
  },
  {
    id: "mermaid",
    icon: "GitBranch",
    isAvailable: (editor) => !!editor.extensionManager.extensions.find((e) => e.name === "mermaid"),
    action: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertMermaid("graph TD\n  A[開始] --> B[終了]")
        .run(),
  },
  {
    id: "mathInline",
    icon: "Sigma",
    isAvailable: (editor) =>
      !!editor.extensionManager.extensions.find((e) => e.name === "mathematics"),
    action: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "math", attrs: { latex: "E = mc^2" } })
        .run(),
  },
  {
    id: "mathBlock",
    icon: "Radical",
    isAvailable: (editor) =>
      !!editor.extensionManager.extensions.find((e) => e.name === "mathematics"),
    action: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "mathBlock", attrs: { latex: "\\sum_{i=1}^{n} x_i" } })
        .run(),
  },
  {
    id: "htmlArtifact",
    icon: "Code2",
    isAvailable: (editor) =>
      !!editor.extensionManager.extensions.find((e) => e.name === "htmlArtifact"),
    action: (editor, range) => {
      const html = window.prompt(
        i18n.t("editor.slash.htmlArtifact.prompt", {
          defaultValue: "HTML コードを貼り付けてください",
        }),
        "",
      );
      if (html === null) return;
      const trimmed = html.trim();
      if (!trimmed) return;
      const title = window.prompt(
        i18n.t("editor.slash.htmlArtifact.promptTitle", { defaultValue: "タイトル（省略可）" }),
        "",
      );
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertHtmlArtifact({ content: trimmed, title: title?.trim() || "" })
        .run();
    },
  },
];

/**
 * Filter slash command items by query text.
 * Matches against translated title and aliases (case-insensitive).
 */
export function filterSlashCommandItems(
  items: SlashCommandItem[],
  query: string,
  editor: Editor,
  t: TFunction,
): SlashCommandItem[] {
  const normalizedQuery = query.toLowerCase().trim();

  return items.filter((item) => {
    if (item.isAvailable && !item.isAvailable(editor)) return false;
    if (!normalizedQuery) return true;
    const title = t(`editor.slash.${item.id}.title`).toLowerCase();
    const aliasesStr = t(`editor.slash.${item.id}.aliases`);
    const aliases = aliasesStr ? aliasesStr.split(",").map((s) => s.trim().toLowerCase()) : [];
    if (title.includes(normalizedQuery)) return true;
    if (aliases.some((alias) => alias.includes(normalizedQuery))) return true;
    return false;
  });
}
