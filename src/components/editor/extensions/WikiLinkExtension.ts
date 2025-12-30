import { Mark, mergeAttributes } from '@tiptap/core';

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, unknown>;
  onLinkClick?: (title: string, exists: boolean) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (attributes: { title: string; exists: boolean }) => ReturnType;
      unsetWikiLink: () => ReturnType;
    };
  }
}

export const WikiLink = Mark.create<WikiLinkOptions>({
  name: 'wikiLink',

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
        parseHTML: (element) => element.getAttribute('data-title'),
        renderHTML: (attributes) => ({
          'data-title': attributes.title,
        }),
      },
      exists: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-exists') === 'true',
        renderHTML: (attributes) => ({
          'data-exists': String(attributes.exists),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-wiki-link]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const exists = HTMLAttributes['data-exists'] === 'true' || HTMLAttributes['data-exists'] === true;
    return [
      'span',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          'data-wiki-link': '',
          class: exists ? 'wiki-link' : 'wiki-link-ghost',
        }
      ),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-[': () => false, // Prevent default
    };
  },
});
