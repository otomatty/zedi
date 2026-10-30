import {
  Editor,
  Extension,
  InputRule,
  Mark,
  Node,
  mergeAttributes,
  type ChainedCommands,
} from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Suggestion from "@tiptap/suggestion";
import { createRoot } from "hono/jsx/dom/client";
import type * as Y from "yjs";
import { SLASH_ITEMS, filterSlashItems, type SlashItem } from "./slashItems";
import type { Awareness } from "y-protocols/awareness";
import { SharedCarets } from "./sharedCarets";
import { createSuggestionRenderer } from "./suggestionPopup";
import { TAG_INPUT_PATTERN } from "./tagPattern";
import { WikiLinkChip } from "./WikiLinkChip";

/** A page that a `[[WikiLink]]` can point at. */
export interface LinkTarget {
  id: string;
  title: string;
}

/** Inline `[[WikiLink]]` node; its node view is rendered with hono/jsx/dom. */
const WikiLink = Node.create<{ searchTargets: (query: string) => Promise<LinkTarget[]> }>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return { searchTargets: async () => [] };
  },
  addAttributes() {
    return { title: { default: "" }, targetId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-wiki-link]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-wiki-link": "" }),
      `[[${node.attrs.title}]]`,
    ];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "wiki-link";
      dom.contentEditable = "false";
      const root = createRoot(dom);
      const paint = (n: typeof node) =>
        root.render(<WikiLinkChip title={n.attrs.title} targetId={n.attrs.targetId} />);
      paint(node);
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== "wikiLink") return false;
          paint(updated);
          return true;
        },
        destroy: () => root.unmount(),
        ignoreMutation: () => true,
      };
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<LinkTarget, LinkTarget>({
        editor: this.editor,
        char: "[[",
        pluginKey: new PluginKey("wikiLinkSuggestion"),
        allowSpaces: true,
        items: ({ query }) => this.options.searchTargets(query),
        command: ({ editor, range, props }) =>
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              { type: "wikiLink", attrs: { title: props.title, targetId: props.id } },
              { type: "text", text: " " },
            ])
            .run(),
        render: createSuggestionRenderer<LinkTarget>((t) => t.title, "一致するページがありません"),
      }),
    ];
  },
});

/** `#tag` mark applied by an input rule when the tag is followed by a space. */
const Tag = Mark.create({
  name: "tag",
  inclusive: false,
  parseHTML() {
    return [{ tag: "span[data-tag]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-tag": "", class: "tag" }), 0];
  },
  addInputRules() {
    return [
      new InputRule({
        find: TAG_INPUT_PATTERN,
        handler: ({ state, range, match }) => {
          const name = match[1];
          if (!name) return null;
          const from = range.from + match[0].indexOf("#");
          state.tr
            .addMark(from, from + 1 + name.length, this.type.create())
            .insertText(" ", range.to)
            .removeStoredMark(this.type);
        },
      }),
    ];
  },
});

function applySlash(chain: ChainedCommands, id: SlashItem["id"]): ChainedCommands {
  switch (id) {
    case "heading1":
      return chain.setNode("heading", { level: 1 });
    case "heading2":
      return chain.setNode("heading", { level: 2 });
    case "bulletList":
      return chain.toggleBulletList();
    case "codeBlock":
      return chain.toggleCodeBlock();
    case "blockquote":
      return chain.toggleBlockquote();
    case "divider":
      return chain.setHorizontalRule();
  }
}

/** `/` slash command menu. */
const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        pluginKey: new PluginKey("slashCommand"),
        items: ({ query }) => (query ? filterSlashItems(query) : [...SLASH_ITEMS]),
        command: ({ editor, range, props }) =>
          applySlash(editor.chain().focus().deleteRange(range), props.id).run(),
        render: createSuggestionRenderer<SlashItem>((i) => i.title, "コマンドがありません"),
      }),
    ];
  },
});

/**
 * Creates the collaborative editor: Tiptap core (no React binding) + Y.js + custom nodes.
 * Tiptap 本体（React バインディングなし）+ Y.js + カスタムノードで共同編集エディタを作る。
 */
export function createEditor(options: {
  element: HTMLElement;
  /** Omit to run a local-only editor (used to isolate the cost of the Y.js binding). */
  collaboration?: {
    doc: Y.Doc;
    provider: { awareness: Awareness };
    user: { name: string; color: string };
    /**
     * Caret sharing: `shared` (default, debounced — see sharedCarets.ts), `tiptap`
     * (Tiptap's CollaborationCaret, publishes on every keystroke) or `off`.
     */
    carets?: "shared" | "tiptap" | "off";
  };
  searchTargets: (query: string) => Promise<LinkTarget[]>;
}): Editor {
  const collab = options.collaboration;
  return new Editor({
    element: options.element,
    extensions: [
      ...(collab
        ? [
            StarterKit.configure({ undoRedo: false }),
            Collaboration.configure({ document: collab.doc }),
            ...(collab.carets === "off"
              ? []
              : collab.carets === "tiptap"
                ? [CollaborationCaret.configure({ provider: collab.provider, user: collab.user })]
                : [
                    SharedCarets.configure({
                      awareness: collab.provider.awareness,
                      user: collab.user,
                    }),
                  ]),
          ]
        : [StarterKit]),
      WikiLink.configure({ searchTargets: options.searchTargets }),
      Tag,
      SlashCommand,
    ],
    editorProps: { attributes: { class: "prose", "aria-label": "本文" } },
  });
}
