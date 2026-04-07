import { Mark, markPasteRule, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Regex to match completed WikiLink patterns `[[Title]]` in pasted text.
 * Captures the title (non-empty, no `]` characters) inside the brackets.
 *
 * 貼り付けテキスト中の完成済み WikiLink パターン `[[Title]]` にマッチする正規表現。
 * ブラケット内のタイトル（空でなく `]` を含まない）をキャプチャする。
 */
export const WIKI_LINK_PASTE_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 *
 */
export interface WikiLinkOptions {
  HTMLAttributes: Record<string, unknown>;
  onLinkClick?: (title: string) => void;
}

// Link status types:
// - exists=true: Link to an existing page
// - exists=false, referenced=true: No page yet, but referenced from multiple pages
// - exists=false, referenced=false: New link, not referenced elsewhere

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (attributes: { title: string; exists: boolean }) => ReturnType;
      unsetWikiLink: () => ReturnType;
    };
  }
}

export /**
 *
 */
const WikiLink = Mark.create<WikiLinkOptions>({
  name: "wikiLink",

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {},
      onLinkClick: undefined,
    };
  },

  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => ({
          "data-title": attributes.title,
        }),
      },
      exists: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-exists") === "true",
        renderHTML: (attributes) => ({
          "data-exists": String(attributes.exists),
        }),
      },
      referenced: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-referenced") === "true",
        renderHTML: (attributes) => ({
          "data-referenced": String(attributes.referenced),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    /**
     *
     */
    const exists =
      HTMLAttributes["data-exists"] === "true" || HTMLAttributes["data-exists"] === true;
    /**
     *
     */
    const referenced =
      HTMLAttributes["data-referenced"] === "true" || HTMLAttributes["data-referenced"] === true;

    // Determine CSS class based on link status
    /**
     *
     */
    let className = "wiki-link";
    if (!exists) {
      className = referenced ? "wiki-link-referenced" : "wiki-link-ghost";
    }

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-wiki-link": "",
        class: className,
      }),
      0,
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: WIKI_LINK_PASTE_REGEX,
        type: this.type,
        getAttributes: (match) => {
          /**
           *
           */
          const title = (match[1] ?? "").trim();
          if (!title) return false;
          return { title, exists: false, referenced: false };
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-[": () => false, // Prevent default
    };
  },

  addProseMirrorPlugins() {
    /**
     *
     */
    const { onLinkClick } = this.options;

    return [
      new Plugin({
        key: new PluginKey("wikiLinkClick"),
        props: {
          handleClick: (_view, _pos, event) => {
            if (!onLinkClick) return false;

            /**
             *
             */
            const target = event.target as HTMLElement;

            // Check if clicked on a wiki-link element
            /**
             *
             */
            const wikiLinkElement = target.closest("[data-wiki-link]") as HTMLElement | null;
            if (!wikiLinkElement) return false;

            /**
             *
             */
            const title = wikiLinkElement.getAttribute("data-title");

            if (title) {
              event.preventDefault();
              event.stopPropagation();
              onLinkClick(title);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
