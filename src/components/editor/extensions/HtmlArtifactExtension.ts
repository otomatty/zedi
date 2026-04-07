import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { HtmlArtifactNodeView } from "../HtmlArtifactNodeView";

/**
 * HTML アーティファクトノードのオプション。
 * Options for the HTML artifact node extension.
 */
export interface HtmlArtifactOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    /**
     * HTML アーティファクトを挿入する。
     * Insert an HTML artifact block.
     */
    insertHtmlArtifact: (attrs: { content: string; title?: string }) => ReturnType;
    /**
     * HTML アーティファクトの属性を更新する。
     * Update an HTML artifact's attributes.
     */
    updateHtmlArtifact: (attrs: { content?: string; title?: string }) => ReturnType;
  }
}

/**
 * Claude 等の AI が出力するインタラクティブ HTML（SVG / Canvas / Script）を
 * sandboxed iframe で安全に埋め込むための TipTap ノード拡張。
 *
 * TipTap node extension that safely embeds interactive HTML (SVG / Canvas / Script)
 * output by Claude or other AIs via a sandboxed iframe.
 */
export const HtmlArtifact = Node.create<HtmlArtifactOptions>({
  name: "htmlArtifact",

  group: "block",

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      content: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-content") || "",
        renderHTML: (attributes) => ({
          "data-content": attributes.content,
        }),
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title") || "",
        renderHTML: (attributes) => (attributes.title ? { "data-title": attributes.title } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="html-artifact"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "html-artifact",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlArtifactNodeView);
  },

  addCommands() {
    return {
      insertHtmlArtifact:
        ({ content, title }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { content, title: title ?? "" },
          });
        },
      updateHtmlArtifact:
        (attrs) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, attrs);
        },
    };
  },
});
