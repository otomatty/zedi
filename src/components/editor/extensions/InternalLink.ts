// Internal Link Extension for Tiptap
// Implements [[Page Title]] syntax for wiki-style internal links

import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface InternalLinkOptions {
  HTMLAttributes: Record<string, any>;
  onLinkClick?: (title: string, exists: boolean) => void;
  existingTitles?: string[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    internalLink: {
      /**
       * Set an internal link mark
       */
      setInternalLink: (attributes: { title: string }) => ReturnType;
      /**
       * Toggle an internal link mark
       */
      toggleInternalLink: (attributes: { title: string }) => ReturnType;
      /**
       * Unset an internal link mark
       */
      unsetInternalLink: () => ReturnType;
    };
  }
}

export const InternalLink = Mark.create<InternalLinkOptions>({
  name: "internalLink",

  priority: 1000,

  keepOnSplit: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      onLinkClick: undefined,
      existingTitles: [],
    };
  },

  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => {
          if (!attributes.title) {
            return {};
          }
          return {
            "data-title": attributes.title,
          };
        },
      },
      exists: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-exists") === "true",
        renderHTML: (attributes) => {
          return {
            "data-exists": attributes.exists ? "true" : "false",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="internal-link"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const exists = HTMLAttributes["data-exists"] === "true";
    const className = exists ? "internal-link" : "ghost-link";
    
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "internal-link",
        class: className,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setInternalLink:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleInternalLink:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetInternalLink:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      // Plugin to handle clicking on internal links
      new Plugin({
        key: new PluginKey("internalLinkClick"),
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement;
            if (
              target.hasAttribute("data-type") &&
              target.getAttribute("data-type") === "internal-link"
            ) {
              const title = target.getAttribute("data-title");
              const exists = target.getAttribute("data-exists") === "true";
              if (title && extension.options.onLinkClick) {
                extension.options.onLinkClick(title, exists);
              }
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

// Input rule to convert [[text]] to internal link
export function createInternalLinkInputRule() {
  // Regex to match [[anything]]
  const INTERNAL_LINK_REGEX = /\[\[([^\]]+)\]\]/g;

  return {
    find: INTERNAL_LINK_REGEX,
    handler: ({ state, range, match }: any) => {
      const title = match[1];
      if (!title) return null;

      const { tr } = state;
      const start = range.from;
      const end = range.to;

      // Replace [[title]] with just the title text, marked as internal link
      tr.replaceWith(start, end, state.schema.text(title));
      tr.addMark(
        start,
        start + title.length,
        state.schema.marks.internalLink.create({ title, exists: false })
      );

      return tr;
    },
  };
}

export default InternalLink;
