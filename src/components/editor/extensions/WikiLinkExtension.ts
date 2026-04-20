import { Mark, markPasteRule, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Regex to match completed WikiLink patterns `[[Title]]` in pasted text.
 *
 * 貼り付けテキスト中の完成済み WikiLink パターン `[[Title]]` にマッチする正規表現。
 *
 * Tiptap の `markPasteRule` は「最後のキャプチャグループ」の範囲にのみマークを適用し、
 * それ以外を削除する仕様のため、括弧 `[[ ]]` を保持するには全体を単一キャプチャに
 * 含めてマッチ全長をマーク対象とする必要がある。ここでは敢えてキャプチャグループを
 * 使わず、マッチ全体（`match[0]`）が `markPasteRule` の captureGroup として扱われる
 * ようにする。タイトルは `extractWikiLinkTitle` で後付け抽出する。
 *
 * Tiptap's `markPasteRule` only applies the mark to the *last* capture group
 * and deletes everything outside of it. To preserve the `[[ ]]` brackets, we
 * intentionally omit capture groups so that `match[match.length - 1]` equals
 * `match[0]` (the full match), keeping brackets intact. The title is extracted
 * afterwards via `extractWikiLinkTitle`.
 */
export const WIKI_LINK_PASTE_REGEX = /\[\[[^[\]]+\]\]/g;

/**
 * Regex capturing the title portion of a WikiLink (non-global, for title extraction).
 * 内部タイトル抽出用の正規表現（非グローバル）。
 */
const WIKI_LINK_TITLE_REGEX = /\[\[([^[\]]+)\]\]/;

/**
 * Extract the trimmed title from a `[[Title]]` literal, or `null` if empty.
 * `[[Title]]` 形式の文字列からトリム済みタイトルを取り出す。空なら `null`。
 */
function extractWikiLinkTitle(fullMatch: string): string | null {
  const m = fullMatch.match(WIKI_LINK_TITLE_REGEX);
  const title = (m?.[1] ?? "").trim();
  return title || null;
}

/**
 * Options for the WikiLink mark extension.
 * WikiLink マーク拡張のオプション。
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

/**
 * Tiptap mark extension for WikiLinks (`[[Title]]`).
 * WikiLink（`[[Title]]`）用の Tiptap マーク拡張。
 */
export const WikiLink = Mark.create<WikiLinkOptions>({
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
    const exists =
      HTMLAttributes["data-exists"] === "true" || HTMLAttributes["data-exists"] === true;
    const referenced =
      HTMLAttributes["data-referenced"] === "true" || HTMLAttributes["data-referenced"] === true;

    // Determine CSS class based on link status
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
          // match[0] は `[[Title]]` 全体。ここからタイトルのみを取り出す。
          // match[0] is the full `[[Title]]` literal; extract only the title.
          const title = extractWikiLinkTitle(match[0] ?? "");
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
    const { onLinkClick } = this.options;

    return [
      new Plugin({
        key: new PluginKey("wikiLinkClick"),
        props: {
          handleClick: (_view, _pos, event) => {
            if (!onLinkClick) return false;

            const target = event.target as HTMLElement;

            // Check if clicked on a wiki-link element
            const wikiLinkElement = target.closest("[data-wiki-link]") as HTMLElement | null;
            if (!wikiLinkElement) return false;

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
