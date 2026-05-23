/**
 * Tests for the inline ghost completion ProseMirror plugin (issue #930,
 * parent #924 §4).
 * インラインゴースト補完用 ProseMirror プラグインのテスト（issue #930、
 * 親 #924 §4）。
 *
 * Same TDD-friendly approach as `tagSuggestionPlugin.test.ts`: build a minimal
 * ProseMirror schema (paragraph / heading / blockquote / list / table cell /
 * code block, plus `code` and `wikiLink` marks) and feed transactions directly
 * so we can pin trigger / dismissal behaviour without spinning up a real
 * Tiptap editor. Confirmation logic is exercised via `buildConfirmTransaction`
 * which is a pure function over `EditorState`.
 *
 * `tagSuggestionPlugin.test.ts` と同じく最小スキーマと直接 transaction 適用
 * でプラグインの挙動を固定する。確定パスは pure な
 * `buildConfirmTransaction` で検証する（view 構築不要）。
 */

import type { Plugin } from "@tiptap/pm/state";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";
import {
  WikiLinkGhostCompletionPlugin,
  wikiLinkGhostCompletionPluginKey,
  buildConfirmTransaction,
  buildGhostCompletionWidget,
  type WikiLinkGhostCompletionCandidate,
  type WikiLinkGhostCompletionState,
  type WikiLinkGhostCompletionOptions,
} from "./wikiLinkGhostCompletionPlugin";
import { WikiLinkSuggestionPlugin, wikiLinkSuggestionPluginKey } from "./wikiLinkSuggestionPlugin";
import { TagSuggestionPlugin, tagSuggestionPluginKey } from "./tagSuggestionPlugin";
import { SlashSuggestionPlugin, slashSuggestionPluginKey } from "./slashSuggestionPlugin";

/**
 * Minimal schema covering every node / mark the plugin needs to reason about.
 * 本プラグインが判定する全ノード / マークを最小スキーマで再現。
 */
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "text*",
      toDOM: () => ["p", 0],
    },
    heading: {
      group: "block",
      content: "text*",
      attrs: { level: { default: 2 } },
      toDOM: (n) => [`h${n.attrs.level as number}`, 0],
    },
    blockquote: {
      group: "block",
      content: "block+",
      toDOM: () => ["blockquote", 0],
    },
    bullet_list: {
      group: "block",
      content: "list_item+",
      toDOM: () => ["ul", 0],
    },
    list_item: {
      content: "paragraph block*",
      toDOM: () => ["li", 0],
    },
    table: {
      group: "block",
      content: "table_row+",
      toDOM: () => ["table", ["tbody", 0]],
    },
    table_row: {
      content: "table_cell+",
      toDOM: () => ["tr", 0],
    },
    table_cell: {
      content: "paragraph+",
      toDOM: () => ["td", 0],
    },
    code_block: {
      group: "block",
      content: "text*",
      code: true,
      defining: true,
      marks: "",
      toDOM: () => ["pre", ["code", 0]],
    },
    // Used to verify ancestor-based suppression ("title / caption / 本文外").
    // 「タイトル / キャプション / 本文外」の祖先抑止を検証するためのノード。
    title: {
      group: "block",
      content: "text*",
      toDOM: () => ["h1", 0],
    },
    caption: {
      group: "block",
      content: "text*",
      toDOM: () => ["figcaption", 0],
    },
    text: { group: "inline" },
  },
  marks: {
    code: {
      code: true,
      toDOM: () => ["code", 0],
    },
    wikiLink: {
      attrs: {
        title: { default: null },
        exists: { default: true },
        referenced: { default: false },
        targetId: { default: null },
      },
      toDOM: () => ["span", { "data-wiki-link": "" }, 0],
    },
  },
});

/**
 * Pulls the bare ProseMirror plugin out of the Tiptap extension wrapper so we
 * can install it on a hand-built `EditorState`. Same pattern as
 * `tagSuggestionPlugin.test.ts`.
 *
 * Tiptap 拡張ラッパーから素の ProseMirror プラグインを取り出す。
 */
function getPlugin(options: WikiLinkGhostCompletionOptions): Plugin {
  const extension = WikiLinkGhostCompletionPlugin.configure(options);
  const addPlugins = extension.config.addProseMirrorPlugins;
  if (!addPlugins) throw new Error("addProseMirrorPlugins missing");
  const plugins = addPlugins.call({ options } as never);
  return plugins[0];
}

interface BuildOpts {
  candidates?: ReadonlyArray<WikiLinkGhostCompletionCandidate>;
  onStateChange?: (s: WikiLinkGhostCompletionState) => void;
  allowedNodeTypes?: ReadonlySet<string>;
}

function buildPlugin(opts: BuildOpts = {}): Plugin {
  return getPlugin({
    getCandidates: () => opts.candidates ?? [],
    onStateChange: opts.onStateChange,
    allowedNodeTypes: opts.allowedNodeTypes,
  });
}

/**
 * Place caret at end of inline content in the given block.
 * 指定ブロックのインライン末尾にキャレットを置く。
 */
function caretAtEnd(state: EditorState, text: string): EditorState {
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length));
  return state.apply(tr);
}

function makeParagraphState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  return caretAtEnd(state, text);
}

function makeHeadingState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("heading", { level: 2 }, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  return caretAtEnd(state, text);
}

function makeBlockquoteState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("blockquote", null, [
      schema.node("paragraph", null, text ? [schema.text(text)] : []),
    ]),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  // doc(0)/blockquote(1)/paragraph(1)/text… → caret at 2 + text.length.
  // ネスト 2 段なので caret 位置は 2 + text.length。
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 2 + text.length));
  return state.apply(tr);
}

function makeListItemState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("bullet_list", null, [
      schema.node("list_item", null, [
        schema.node("paragraph", null, text ? [schema.text(text)] : []),
      ]),
    ]),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  // doc/bullet_list(1)/list_item(1)/paragraph(1)/text…
  // ネスト 3 段なので caret 位置は 3 + text.length。
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 3 + text.length));
  return state.apply(tr);
}

function makeTableCellState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("table", null, [
      schema.node("table_row", null, [
        schema.node("table_cell", null, [
          schema.node("paragraph", null, text ? [schema.text(text)] : []),
        ]),
      ]),
    ]),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  // doc/table(1)/table_row(1)/table_cell(1)/paragraph(1)/text…
  // ネスト 4 段なので caret 位置は 4 + text.length。
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 4 + text.length));
  return state.apply(tr);
}

function makeCodeBlockState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("code_block", null, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  return caretAtEnd(state, text);
}

function makeInlineCodeState(text: string, plugin: Plugin): EditorState {
  const codeMark = schema.marks.code.create();
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text, [codeMark])] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  return caretAtEnd(state, text);
}

function makeTitleNodeState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("title", null, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  return caretAtEnd(state, text);
}

function makeCaptionNodeState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("caption", null, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  return caretAtEnd(state, text);
}

function makeInsideWikiLinkState(text: string, plugin: Plugin): EditorState {
  const linkMark = schema.marks.wikiLink.create({
    title: "Existing",
    exists: true,
    referenced: false,
    targetId: null,
  });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text, [linkMark])] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  return caretAtEnd(state, text);
}

const TARGETS = [
  { id: "id-ghost", title: "Ghost Target" },
  { id: "id-another", title: "Another Note" },
  { id: "id-technique", title: "技術メモ" },
] as const satisfies ReadonlyArray<WikiLinkGhostCompletionCandidate>;

describe("wikiLinkGhostCompletionPlugin — initial state", () => {
  it("initialises as inactive", () => {
    const plugin = buildPlugin();
    const state = makeParagraphState("", plugin);
    const pluginState = wikiLinkGhostCompletionPluginKey.getState(state);
    expect(pluginState).toMatchObject({
      active: false,
      range: null,
      query: "",
      candidate: null,
      suffix: "",
    });
  });
});

describe("wikiLinkGhostCompletionPlugin — activation", () => {
  it("activates when the typed word prefix-matches a candidate title", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("Gho", plugin);
    const pluginState = wikiLinkGhostCompletionPluginKey.getState(state);

    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("Gho");
    expect(pluginState?.candidate).toMatchObject({ id: "id-ghost", title: "Ghost Target" });
    expect(pluginState?.suffix).toBe("st Target");
    expect(pluginState?.range).toEqual({ from: 1, to: 4 });
  });

  it("preserves the candidate's casing in the suffix even if the user typed lowercase", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("gho", plugin);
    const pluginState = wikiLinkGhostCompletionPluginKey.getState(state);
    expect(pluginState?.active).toBe(true);
    expect(pluginState?.suffix).toBe("st Target");
    expect(pluginState?.query).toBe("gho");
  });

  it("matches CJK candidates", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("技", plugin);
    // 1 char only → ≥2 rule rejects.
    // 1 文字なので 2 文字以上ルールにより不発火。
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);

    const state2 = makeParagraphState("技術", plugin);
    const ps = wikiLinkGhostCompletionPluginKey.getState(state2);
    expect(ps?.active).toBe(true);
    expect(ps?.suffix).toBe("メモ");
    expect(ps?.candidate?.id).toBe("id-technique");
  });

  it("fires on heading, blockquote, list item, and table cell", () => {
    const cases: Array<(t: string, p: Plugin) => EditorState> = [
      makeHeadingState,
      makeBlockquoteState,
      makeListItemState,
      makeTableCellState,
    ];
    for (const make of cases) {
      const plugin = buildPlugin({ candidates: TARGETS });
      const state = make("Gho", plugin);
      const ps = wikiLinkGhostCompletionPluginKey.getState(state);
      expect(ps?.active, `expected active in ${make.name}`).toBe(true);
      expect(ps?.suffix).toBe("st Target");
    }
  });

  it("calls onStateChange with the activation state", () => {
    const onStateChange = vi.fn();
    const plugin = buildPlugin({ candidates: TARGETS, onStateChange });
    makeParagraphState("Gho", plugin);
    expect(onStateChange).toHaveBeenCalled();
    const calls = onStateChange.mock.calls;
    const last = calls[calls.length - 1]?.[0] as WikiLinkGhostCompletionState;
    expect(last.active).toBe(true);
    expect(last.candidate?.title).toBe("Ghost Target");
  });
});

describe("wikiLinkGhostCompletionPlugin — minimum length and word boundary", () => {
  it("does not activate for a single-character word", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("G", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("does not activate when there are no candidate matches", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("Xyz", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("does not activate for an exact match (no suffix to show)", () => {
    const plugin = buildPlugin({
      candidates: [{ id: "x", title: "Hello" }],
    });
    const state = makeParagraphState("Hello", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("only considers the current word (post-whitespace)", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("hello Gho", plugin);
    const ps = wikiLinkGhostCompletionPluginKey.getState(state);
    expect(ps?.active).toBe(true);
    expect(ps?.query).toBe("Gho");
    // "hello " is 6 chars → typed word starts at pos 7.
    // 直前の "hello " が 6 文字なので入力中の単語は pos 7 から始まる。
    expect(ps?.range).toEqual({ from: 7, to: 10 });
  });

  it("rejects words that start with `[`, `]`, `#`, `@`, or `/`", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    for (const leader of ["[", "]", "#", "@", "/"]) {
      const state = makeParagraphState(`${leader}Gho`, plugin);
      expect(
        wikiLinkGhostCompletionPluginKey.getState(state)?.active,
        `expected inactive for leader "${leader}"`,
      ).toBe(false);
    }
  });
});

describe("wikiLinkGhostCompletionPlugin — code block / inline code suppression", () => {
  it("does not activate inside a code block", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeCodeBlockState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("does not activate inside an inline `code` mark", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeInlineCodeState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });
});

describe("wikiLinkGhostCompletionPlugin — out-of-body suppression", () => {
  it("does not activate inside a `title` node", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeTitleNodeState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("does not activate inside a `caption` node", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeCaptionNodeState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("does not activate inside an existing `wikiLink` mark", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeInsideWikiLinkState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });
});

describe("wikiLinkGhostCompletionPlugin — coordination with other suggesters", () => {
  it("is suppressed when the `[[` suggestion plugin is active", () => {
    // We install both plugins so the `apply` of the wiki suggestion plugin
    // populates its own state before ours runs.
    // 両プラグインを併設し、wiki サジェスト側の `apply` でその状態が立ってから
    // 本プラグインの `apply` が走る順序を再現する。
    const ghost = buildPlugin({ candidates: TARGETS });
    const wikiExt = WikiLinkSuggestionPlugin.configure({});
    const addWikiPlugins = wikiExt.config.addProseMirrorPlugins;
    if (!addWikiPlugins) throw new Error("WikiLinkSuggestionPlugin.addProseMirrorPlugins missing");
    const wikiPlugin = addWikiPlugins.call({ options: {} } as never)[0];

    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("[[Gho")])]);
    let state = EditorState.create({ doc, schema, plugins: [wikiPlugin, ghost] });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));

    // Wiki link suggestion must be active for this assertion to be meaningful.
    // この assertion が意味を持つよう、Wiki サジェスト側が active であることを担保。
    expect(wikiLinkSuggestionPluginKey.getState(state)?.active).toBe(true);
    // Ghost completion must be suppressed.
    // ゴースト補完は抑止されているべき。
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("is suppressed when the `#` tag suggestion plugin is active", () => {
    const ghost = buildPlugin({ candidates: TARGETS });
    const tagExt = TagSuggestionPlugin.configure({});
    const addTagPlugins = tagExt.config.addProseMirrorPlugins;
    if (!addTagPlugins) throw new Error("TagSuggestionPlugin.addProseMirrorPlugins missing");
    const tagPlugin = addTagPlugins.call({ options: {} } as never)[0];

    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("#Gho")])]);
    let state = EditorState.create({ doc, schema, plugins: [tagPlugin, ghost] });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)));

    expect(tagSuggestionPluginKey.getState(state)?.active).toBe(true);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("is suppressed when the `/` slash suggestion plugin is active (even mid-arg)", () => {
    // SlashSuggestionPlugin は空白を含むクエリでも active を維持するため、
    // 「`/cmd Ghost`」のような入力ではスラッシュメニューとゴーストが衝突しうる。
    // ここでは両プラグインを同居させ、スラッシュ active 中はゴーストが立たない
    // ことを保証する（Codex PR レビュー指摘）。
    // SlashSuggestionPlugin stays active across whitespace, so an input like
    // `/cmd Ghost` could double-fire the ghost. This test pins the mutual
    // exclusion contract added in response to the PR review.
    const ghost = buildPlugin({ candidates: TARGETS });
    const slashExt = SlashSuggestionPlugin.configure({});
    const addSlashPlugins = slashExt.config.addProseMirrorPlugins;
    if (!addSlashPlugins) throw new Error("SlashSuggestionPlugin.addProseMirrorPlugins missing");
    const slashPlugin = addSlashPlugins.call({ options: {} } as never)[0];

    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("/cmd Gho")]),
    ]);
    let state = EditorState.create({ doc, schema, plugins: [slashPlugin, ghost] });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9)));

    // Slash サジェスト側が active であることを前提に、ゴーストは抑止される。
    // Slash side must be active for this assertion to be meaningful.
    expect(slashSuggestionPluginKey.getState(state)?.active).toBe(true);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });
});

describe("wikiLinkGhostCompletionPlugin — dismissal", () => {
  it("turns off when the typed prefix no longer matches", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    let state = makeParagraphState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(true);

    state = state.apply(state.tr.insertText("x", 4));
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("turns off when selection becomes a non-empty range", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    let state = makeParagraphState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(true);

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 4)));
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("close meta clears the active state and notifies subscribers", () => {
    const onStateChange = vi.fn();
    const plugin = buildPlugin({ candidates: TARGETS, onStateChange });
    let state = makeParagraphState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(true);
    onStateChange.mockClear();

    state = state.apply(state.tr.setMeta(wikiLinkGhostCompletionPluginKey, { close: true }));
    const ps = wikiLinkGhostCompletionPluginKey.getState(state);
    expect(ps?.active).toBe(false);
    expect(ps?.candidate).toBeNull();
    expect(onStateChange).toHaveBeenCalledWith(ps);
  });
});

describe("wikiLinkGhostCompletionPlugin — candidate filtering and tie-breaking", () => {
  it("ignores soft-deleted candidates", () => {
    const plugin = buildPlugin({
      candidates: [{ id: "x", title: "Ghost Town", isDeleted: true }],
    });
    const state = makeParagraphState("Gho", plugin);
    expect(wikiLinkGhostCompletionPluginKey.getState(state)?.active).toBe(false);
  });

  it("breaks ties by shortest title", () => {
    const plugin = buildPlugin({
      candidates: [
        { id: "long", title: "Tested Across Suite" },
        { id: "short", title: "Tested" },
        { id: "mid", title: "Tested Path" },
      ],
    });
    const state = makeParagraphState("Tes", plugin);
    const ps = wikiLinkGhostCompletionPluginKey.getState(state);
    expect(ps?.active).toBe(true);
    expect(ps?.candidate?.id).toBe("short");
    expect(ps?.suffix).toBe("ted");
  });
});

describe("wikiLinkGhostCompletionPlugin — decorations", () => {
  it("renders a widget decoration at the end of the typed range when active", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("Gho", plugin);
    const ps = wikiLinkGhostCompletionPluginKey.getState(state);
    expect(ps?.active).toBe(true);

    const decos = ps?.decorations.find(0, state.doc.content.size) ?? [];
    expect(decos).toHaveLength(1);
    // Widget decorations have `from === to` at the insertion point.
    // widget の from === to が widget 位置。
    expect(decos[0].from).toBe(4);
    expect(decos[0].to).toBe(4);
  });

  it("returns an empty decoration set when inactive", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("Xyz", plugin);
    const ps = wikiLinkGhostCompletionPluginKey.getState(state);
    expect(ps?.active).toBe(false);
    const decos = ps?.decorations.find(0, state.doc.content.size) ?? [];
    expect(decos).toHaveLength(0);
  });
});

describe("buildGhostCompletionWidget", () => {
  it("renders a span with the correct class, suffix, target id, and non-editable flag", () => {
    const span = buildGhostCompletionWidget("st Target", { id: "id-ghost", title: "Ghost Target" });
    expect(span.tagName).toBe("SPAN");
    expect(span.className).toBe("wiki-link-ghost-completion");
    expect(span.textContent).toBe("st Target");
    expect(span.getAttribute("data-ghost-completion")).toBe("true");
    expect(span.getAttribute("data-target-id")).toBe("id-ghost");
    expect(span.getAttribute("contenteditable")).toBe("false");
  });
});

describe("buildConfirmTransaction", () => {
  it("replaces the typed range with the full title carrying a wikiLink mark", () => {
    const plugin = buildPlugin({ candidates: TARGETS });
    const state = makeParagraphState("Gho", plugin);
    const ps = wikiLinkGhostCompletionPluginKey.getState(state);
    if (!ps?.active || !ps.range || !ps.candidate) {
      throw new Error("expected plugin state to be active with range + candidate");
    }

    const tr = buildConfirmTransaction(state, ps.range, ps.candidate);
    if (!tr) throw new Error("expected non-null confirm transaction");
    const next = state.apply(tr);

    // After confirm, the paragraph contains the full title with a wikiLink mark.
    // 確定後、段落はフルタイトル + wikiLink マークを持つ。
    const para = next.doc.firstChild;
    if (!para) throw new Error("expected doc to have a child");
    expect(para.textContent).toBe("Ghost Target");
    const firstText = para.firstChild;
    if (!firstText) throw new Error("expected paragraph to have a text node");
    const wikiMark = firstText.marks.find((m) => m.type === schema.marks.wikiLink);
    expect(wikiMark).toBeDefined();
    expect(wikiMark?.attrs).toMatchObject({
      title: "Ghost Target",
      exists: true,
      referenced: false,
      targetId: "id-ghost",
    });

    // Plugin state collapses to inactive on the same transaction (close meta).
    // 同じ transaction の close メタで非アクティブに倒れる。
    expect(wikiLinkGhostCompletionPluginKey.getState(next)?.active).toBe(false);

    // Cursor lands right after the inserted title.
    // 挿入直後（"Ghost Target".length = 12 → pos 1 + 12 = 13）に caret。
    expect(next.selection.from).toBe(13);
    expect(next.selection.to).toBe(13);

    // Stored marks cleared so the next keystroke is not styled as a wikiLink.
    // 直後のキーストロークがマークを引き継がないことを保証。
    expect(next.storedMarks ?? []).toEqual([]);
  });

  it("returns null if the schema lacks a wikiLink mark", () => {
    const slimSchema = new Schema({
      nodes: {
        doc: { content: "paragraph+" },
        paragraph: { content: "text*", toDOM: () => ["p", 0] },
        text: {},
      },
      marks: {},
    });
    const doc = slimSchema.node("doc", null, [
      slimSchema.node("paragraph", null, [slimSchema.text("Gho")]),
    ]);
    const state = EditorState.create({ doc, schema: slimSchema });
    const tr = buildConfirmTransaction(
      state,
      { from: 1, to: 4 },
      { id: "x", title: "Ghost Target" },
    );
    expect(tr).toBeNull();
  });
});

describe("WikiLinkGhostCompletionPlugin — extension wiring", () => {
  it("declares the expected extension name", () => {
    expect(WikiLinkGhostCompletionPlugin.name).toBe("wikiLinkGhostCompletion");
  });

  it("uses an empty default candidate list when no getCandidates is supplied", () => {
    const ext = WikiLinkGhostCompletionPlugin.configure();
    expect(ext.options.getCandidates()).toEqual([]);
    expect(ext.options.onStateChange).toBeUndefined();
  });
});
