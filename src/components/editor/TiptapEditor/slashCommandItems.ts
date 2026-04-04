import type { Editor } from "@tiptap/core";

/**
 *
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
    id: "heading1",
    icon: "Heading1",
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
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
    id: "executableCodeBlock",
    icon: "Terminal",
    isAvailable: (editor) =>
      !!editor.extensionManager.extensions.find((e) => e.name === "executableCodeBlock"),
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).insertExecutableCodeBlock().run(),
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
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent("slash-command-insert-image"));
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
