import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MermaidNodeView } from "../MermaidNodeView";

export interface MermaidOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaid: {
      /**
       * Insert a mermaid diagram
       */
      insertMermaid: (code: string) => ReturnType;
      /**
       * Update mermaid diagram code
       */
      updateMermaid: (code: string) => ReturnType;
    };
  }
}

export const Mermaid = Node.create<MermaidOptions>({
  name: "mermaid",

  group: "block",

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-code") || "",
        renderHTML: (attributes) => ({
          "data-code": attributes.code,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "mermaid",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },

  addCommands() {
    return {
      insertMermaid:
        (code: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { code },
          });
        },
      updateMermaid:
        (code: string) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { code });
        },
    };
  },
});
