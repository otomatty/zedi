import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Highlight } from "@tiptap/extension-highlight";
import { Underline } from "@tiptap/extension-underline";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Mathematics } from "@tiptap/extension-mathematics";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { ImageUpload, type ImageUploadOptions } from "../extensions/ImageUploadExtension";
import { StorageImage, type StorageImageOptions } from "../extensions/StorageImageExtension";
import { WikiLink } from "../extensions/WikiLinkExtension";
import { Mermaid } from "../extensions/MermaidExtension";
import {
  WikiLinkSuggestionPlugin,
  type WikiLinkSuggestionState,
} from "../extensions/wikiLinkSuggestionPlugin";
import {
  SlashSuggestionPlugin,
  type SlashSuggestionState,
} from "../extensions/slashSuggestionPlugin";
import type { Extension } from "@tiptap/core";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

// Create shared lowlight instance with common languages
export const lowlight = createLowlight(common);

/**
 * Language display name mapping for code block language selector.
 * Maps lowlight language identifiers to user-friendly display names.
 */
export const CODE_BLOCK_LANGUAGES: { value: string; label: string }[] = [
  { value: "", label: "Plain text" },
  { value: "bash", label: "Bash" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "css", label: "CSS" },
  { value: "diff", label: "Diff" },
  { value: "go", label: "Go" },
  { value: "graphql", label: "GraphQL" },
  { value: "ini", label: "INI" },
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "kotlin", label: "Kotlin" },
  { value: "less", label: "Less" },
  { value: "lua", label: "Lua" },
  { value: "makefile", label: "Makefile" },
  { value: "markdown", label: "Markdown" },
  { value: "objectivec", label: "Objective-C" },
  { value: "perl", label: "Perl" },
  { value: "php", label: "PHP" },
  { value: "python", label: "Python" },
  { value: "r", label: "R" },
  { value: "ruby", label: "Ruby" },
  { value: "rust", label: "Rust" },
  { value: "scss", label: "SCSS" },
  { value: "shell", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "swift", label: "Swift" },
  { value: "typescript", label: "TypeScript" },
  { value: "vbnet", label: "VB.NET" },
  { value: "wasm", label: "WebAssembly" },
  { value: "xml", label: "XML / HTML" },
  { value: "yaml", label: "YAML" },
];

/**
 * Collaboration options for real-time editing (Y.js + Hocuspocus)
 */
export interface CollaborationExtensionsOptions {
  document: Y.Doc;
  field: string;
  /** Awareness instance. When undefined (local mode), CollaborationCaret is not added. */
  awareness?: Awareness;
  user: { name: string; color: string };
}

/**
 * Options for creating editor extensions
 */
export interface EditorExtensionsOptions {
  placeholder: string;
  onLinkClick: (title: string, exists: boolean) => void;
  onStateChange: (state: WikiLinkSuggestionState) => void;
  onSlashStateChange: (state: SlashSuggestionState) => void;
  imageUploadOptions: Partial<ImageUploadOptions>;
  imageOptions: Partial<StorageImageOptions>;
  /** When set, enables Y.js collaboration and caret; StarterKit history is disabled */
  collaboration?: CollaborationExtensionsOptions;
}

/**
 * Create the array of Tiptap extensions for the editor
 */
export function createEditorExtensions(options: EditorExtensionsOptions): Extension[] {
  const useCollaboration = Boolean(options.collaboration);

  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      // Y.js が履歴を管理するためコラボ時は無効
      undoRedo: useCollaboration ? false : undefined,
      // 下で独自設定の Link を使うため StarterKit の link は無効
      link: false,
      // CodeBlockLowlight を使うため StarterKit の codeBlock は無効
      codeBlock: false,
    }),
    // Typography for smart quotes and dashes
    Typography,
    Placeholder.configure({
      placeholder: options.placeholder,
      emptyEditorClass: "is-editor-empty",
    }),
    Link.configure({
      openOnClick: true,
      HTMLAttributes: {
        class: "external-link text-blue-600 hover:underline cursor-pointer",
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
    // --- Phase 1: TaskList, Highlight, Underline ---
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Highlight.configure({
      multicolor: false,
    }),
    Underline,
    // --- Phase 1: Code Block with syntax highlighting ---
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: null,
    }),
    // --- Phase 2: Table ---
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableCell,
    TableHeader,
    // --- Phase 3: Text Color ---
    TextStyle,
    Color,
    // --- Phase 4: Mathematics ---
    Mathematics.configure({
      katexOptions: {
        throwOnError: false,
      },
    }),
    // --- WikiLink ---
    WikiLink.configure({
      onLinkClick: options.onLinkClick,
    }),
    WikiLinkSuggestionPlugin.configure({
      onStateChange: options.onStateChange,
    }),
    // --- Phase 0: Slash Command ---
    SlashSuggestionPlugin.configure({
      onStateChange: options.onSlashStateChange,
    }),
    // --- Image ---
    ImageUpload.configure({
      HTMLAttributes: {},
      ...options.imageUploadOptions,
    }),
    StorageImage.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: {
        class: "tiptap-image max-w-full h-auto rounded-lg my-4",
      },
      ...options.imageOptions,
    }),
    Mermaid,
    // Y.js リアルタイムコラボレーション（オプション）
    ...(options.collaboration
      ? [
          Collaboration.configure({
            document: options.collaboration.document,
            field: options.collaboration.field,
          }),
          // CollaborationCaret は awareness がある場合（collaborative モード）のみ追加
          ...(options.collaboration.awareness
            ? [
                CollaborationCaret.configure({
                  provider: { awareness: options.collaboration.awareness },
                  user: options.collaboration.user,
                }),
              ]
            : []),
        ]
      : []),
  ] as Extension[];
}

/**
 * Default editor props for Tiptap
 */
export const defaultEditorProps = {
  attributes: {
    class: "tiptap-editor focus:outline-none",
  },
};
