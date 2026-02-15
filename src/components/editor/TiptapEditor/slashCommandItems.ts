import type { Editor } from '@tiptap/core';

export interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  aliases: string[];
  icon: string; // Lucide icon name
  /** Return true if the extension required by this item is available */
  isAvailable?: (editor: Editor) => boolean;
  action: (editor: Editor, range: { from: number; to: number }) => void;
}

/**
 * All slash command items.
 * Items with `isAvailable` will only show when their extension is registered.
 */
export const slashCommandItems: SlashCommandItem[] = [
  // --- Basic blocks ---
  {
    id: 'paragraph',
    title: '段落',
    description: '本文テキスト',
    aliases: ['段落', 'paragraph', 'p', 'text'],
    icon: 'Pilcrow',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    id: 'heading1',
    title: '見出し1',
    description: '大見出し',
    aliases: ['見出し1', 'h1', '大見出し', 'heading'],
    icon: 'Heading1',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    id: 'heading2',
    title: '見出し2',
    description: '中見出し',
    aliases: ['見出し2', 'h2', '中見出し', 'heading'],
    icon: 'Heading2',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    id: 'heading3',
    title: '見出し3',
    description: '小見出し',
    aliases: ['見出し3', 'h3', '小見出し', 'heading'],
    icon: 'Heading3',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    id: 'bulletList',
    title: '箇条書き',
    description: '箇条書きリスト',
    aliases: ['箇条書き', 'ul', 'リスト', 'bullet', 'list'],
    icon: 'List',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'orderedList',
    title: '番号付きリスト',
    description: '番号付きの順序リスト',
    aliases: ['番号', 'ol', '順序付き', 'ordered', 'number'],
    icon: 'ListOrdered',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: 'taskList',
    title: 'タスクリスト',
    description: 'チェックボックス付きリスト',
    aliases: ['タスク', 'todo', 'チェック', 'task', 'checkbox'],
    icon: 'CheckSquare',
    isAvailable: (editor) => !!editor.extensionManager.extensions.find(e => e.name === 'taskList'),
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: 'blockquote',
    title: '引用',
    description: '引用ブロック',
    aliases: ['引用', 'blockquote', 'quote'],
    icon: 'Quote',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setBlockquote().run();
    },
  },
  {
    id: 'codeBlock',
    title: 'コードブロック',
    description: 'シンタックスハイライト付きコード',
    aliases: ['コード', 'code', 'pre', 'プログラム'],
    icon: 'Code2',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run();
    },
  },
  {
    id: 'horizontalRule',
    title: '水平線',
    description: '区切り線',
    aliases: ['区切り線', 'hr', '水平', 'divider', 'separator'],
    icon: 'Minus',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: 'table',
    title: 'テーブル',
    description: '3×3 のテーブルを挿入',
    aliases: ['テーブル', '表', 'table'],
    icon: 'Table',
    isAvailable: (editor) => !!editor.extensionManager.extensions.find(e => e.name === 'table'),
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    id: 'image',
    title: '画像',
    description: '画像をアップロード',
    aliases: ['画像', 'image', 'img', '写真'],
    icon: 'ImagePlus',
    action: (editor, range) => {
      // Delete the slash command text first, then trigger file input
      editor.chain().focus().deleteRange(range).run();
      // The image insert will be handled by TiptapEditor via a callback
      // We dispatch a custom event that TiptapEditor listens to
      window.dispatchEvent(new CustomEvent('slash-command-insert-image'));
    },
  },
  {
    id: 'mermaid',
    title: 'ダイアグラム',
    description: 'Mermaid でフローチャートや図を作成',
    aliases: ['ダイアグラム', 'mermaid', '図', 'diagram', 'flowchart'],
    icon: 'GitBranch',
    isAvailable: (editor) => !!editor.extensionManager.extensions.find(e => e.name === 'mermaid'),
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertMermaid('graph TD\n  A[開始] --> B[終了]')
        .run();
    },
  },
  {
    id: 'mathInline',
    title: '数式（インライン）',
    description: 'インライン数式を挿入',
    aliases: ['数式', 'math', 'インライン', 'latex'],
    icon: 'Sigma',
    isAvailable: (editor) => !!editor.extensionManager.extensions.find(e => e.name === 'mathematics'),
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'math',
          attrs: { latex: 'E = mc^2' },
        })
        .run();
    },
  },
  {
    id: 'mathBlock',
    title: '数式（ブロック）',
    description: 'ブロック数式を挿入',
    aliases: ['数式ブロック', 'block math', 'ブロック数式', 'equation'],
    icon: 'Radical',
    isAvailable: (editor) => !!editor.extensionManager.extensions.find(e => e.name === 'mathematics'),
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'mathBlock',
          attrs: { latex: '\\sum_{i=1}^{n} x_i' },
        })
        .run();
    },
  },
];

/**
 * Filter slash command items by query text.
 * Matches against title and aliases (case-insensitive).
 */
export function filterSlashCommandItems(
  items: SlashCommandItem[],
  query: string,
  editor: Editor,
): SlashCommandItem[] {
  const normalizedQuery = query.toLowerCase().trim();

  return items
    .filter((item) => {
      // Check availability
      if (item.isAvailable && !item.isAvailable(editor)) {
        return false;
      }

      // If no query, show all available items
      if (!normalizedQuery) return true;

      // Match title or aliases
      if (item.title.toLowerCase().includes(normalizedQuery)) return true;
      if (item.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))) return true;

      return false;
    });
}
