import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import { WikiLink } from "../extensions/WikiLinkExtension";
import { Mermaid } from "../extensions/MermaidExtension";
import {
  WikiLinkSuggestionPlugin,
  type WikiLinkSuggestionState,
} from "../extensions/wikiLinkSuggestionPlugin";
import type { Extension } from "@tiptap/core";

/**
 * Options for creating editor extensions
 */
export interface EditorExtensionsOptions {
  placeholder: string;
  onLinkClick: (title: string, exists: boolean) => void;
  onStateChange: (state: WikiLinkSuggestionState) => void;
}

/**
 * Create the array of Tiptap extensions for the editor
 */
export function createEditorExtensions(
  options: EditorExtensionsOptions
): Extension[] {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
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
    Mermaid,
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
