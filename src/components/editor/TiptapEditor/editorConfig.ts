import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { ImageUpload, type ImageUploadOptions } from "../extensions/ImageUploadExtension";
import { StorageImage, type StorageImageOptions } from "../extensions/StorageImageExtension";
import { WikiLink } from "../extensions/WikiLinkExtension";
import { Mermaid } from "../extensions/MermaidExtension";
import {
  WikiLinkSuggestionPlugin,
  type WikiLinkSuggestionState,
} from "../extensions/wikiLinkSuggestionPlugin";
import type { Extension } from "@tiptap/core";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

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
  imageUploadOptions: Partial<ImageUploadOptions>;
  imageOptions: Partial<StorageImageOptions>;
  /** When set, enables Y.js collaboration and caret; StarterKit history is disabled */
  collaboration?: CollaborationExtensionsOptions;
}

/**
 * Create the array of Tiptap extensions for the editor
 */
export function createEditorExtensions(
  options: EditorExtensionsOptions
): Extension[] {
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
    WikiLink.configure({
      onLinkClick: options.onLinkClick,
    }),
    WikiLinkSuggestionPlugin.configure({
      onStateChange: options.onStateChange,
    }),
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
