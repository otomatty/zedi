/**
 * Tests for the `#name` tag suggestion ProseMirror plugin (issue #767, Phase 2).
 * `#name` タグサジェスト用 ProseMirror プラグインのテスト（issue #767, Phase 2）。
 *
 * The plugin tracks `#`-triggered queries the same way `wikiLinkSuggestionPlugin`
 * tracks `[[...]]` queries, but with the boundary rules and character class of
 * `TagExtension` so behaviour stays in lock-step with the input/paste rules.
 * These tests build a minimal ProseMirror schema + state and feed transactions
 * directly so we can pin trigger conditions without spinning up a full Tiptap
 * editor (the same pattern as `slashSuggestionPlugin.test.ts`).
 *
 * `wikiLinkSuggestionPlugin` の `[[...]]` 検出と同じ構造で `#name` クエリを
 * 追跡する。`TagExtension` の境界ルール・文字クラスと整合させ、入力規則 /
 * 貼り付け規則とブレが出ないように固定する。最小スキーマと直接トランザクション
 * 適用で振る舞いを固定する（`slashSuggestionPlugin.test.ts` と同じ手法）。
 */

import type { Plugin } from "@tiptap/pm/state";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";
import {
  TagSuggestionPlugin,
  tagSuggestionPluginKey,
  type TagSuggestionState,
} from "./tagSuggestionPlugin";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "text*",
      toDOM: () => ["p", 0],
    },
    code_block: {
      group: "block",
      content: "text*",
      code: true,
      defining: true,
      marks: "",
      toDOM: () => ["pre", ["code", 0]],
    },
    text: { group: "inline" },
  },
  marks: {
    code: {
      // ProseMirror's spec uses `code: true` to mark the schema-spec for inline
      // code; mirrors what StarterKit installs in production. Used by the
      // plugin to skip activation inside inline code.
      // ProseMirror で `code: true` のマークが付くスキーマ。プラグインは
      // インラインコード内ではサジェストを起動しない仕様の検証に使う。
      code: true,
      toDOM: () => ["code", 0],
    },
  },
});

/**
 * Pulls the bare ProseMirror plugin out of the Tiptap extension wrapper so we
 * can install it on a hand-built `EditorState`.
 * Tiptap 拡張ラッパーから素の ProseMirror プラグインを取り出す。
 */
function getPlugin(onStateChange?: (s: TagSuggestionState) => void): Plugin {
  const extension = TagSuggestionPlugin.configure({ onStateChange });
  const addPlugins = extension.config.addProseMirrorPlugins;
  if (!addPlugins) throw new Error("addProseMirrorPlugins missing");
  const plugins = addPlugins.call({ options: { onStateChange } } as never);
  return plugins[0];
}

/**
 * Creates a state with `text` inside a single paragraph and a collapsed cursor
 * placed `caretFromEnd` characters before the end of the text (default 0).
 *
 * 1 段落のドキュメントを生成し、キャレットをテキスト末尾から
 * `caretFromEnd` 文字戻した位置に置く（既定 0 = 末尾）。
 */
function makeParagraphState(text: string, plugin: Plugin, caretFromEnd = 0): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  const caret = 1 + text.length - caretFromEnd;
  const tr = state.tr.setSelection(TextSelection.create(state.doc, caret));
  return state.apply(tr);
}

/**
 * Creates a state where `text` lives inside a `code_block` node. Used to
 * verify the plugin does not fire while the cursor is in a code block.
 *
 * `text` を `code_block` 内に置いた状態を作る。コードブロック内では
 * サジェストが起動しないことを検証する。
 */
function makeCodeBlockState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("code_block", null, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length));
  return state.apply(tr);
}

/**
 * Creates a state with a single paragraph whose entire content is wrapped in
 * an inline `code` mark, then puts the cursor at the end. Used to verify
 * inline-code suppression.
 *
 * 段落の全文に inline `code` マークを掛けた状態を作る。インラインコード内
 * では起動しない仕様の検証に使う。
 */
function makeInlineCodeState(text: string, plugin: Plugin): EditorState {
  const codeMark = schema.marks.code.create();
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text, [codeMark])] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length));
  return state.apply(tr);
}

describe("tagSuggestionPlugin — initial state", () => {
  it("initialises with no active suggestion", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState).toEqual({
      active: false,
      query: "",
      range: null,
      decorations: expect.any(Object),
    });
  });
});

describe("tagSuggestionPlugin — activation triggers", () => {
  it("activates the moment `#` is typed at the start of a paragraph", () => {
    // 段落先頭で `#` を打鍵した瞬間にサジェスト UI を出す（受け入れ条件）。
    // The popup must appear immediately after the user types `#`.
    const onStateChange = vi.fn();
    const plugin = getPlugin(onStateChange);
    const state = makeParagraphState("#", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);

    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("");
    // `#` 自体は pos 1〜2 の範囲。range は確定時に削除→挿入の範囲として使う。
    // The hash itself sits at positions 1..2; range is later used to replace
    // the typed `#name` with the styled mark on confirm.
    expect(pluginState?.range).toEqual({ from: 1, to: 2 });
    expect(onStateChange).toHaveBeenCalledWith(pluginState);
  });

  it("captures the query text after `#`", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("#tec", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);

    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("tec");
    expect(pluginState?.range).toEqual({ from: 1, to: 5 });
  });

  it("activates on a `#` preceded by a non-word boundary (space)", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("hello #tec", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);

    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("tec");
    // `hello ` (6 chars) → `#` at pos 7, query ends at pos 11.
    expect(pluginState?.range).toEqual({ from: 7, to: 11 });
  });

  it("captures CJK characters in the query", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("#技術", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("技術");
  });

  it("captures hyphens and underscores in the query", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("#front-end_v2", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("front-end_v2");
  });
});

describe("tagSuggestionPlugin — non-trigger inputs", () => {
  it("does not activate when `#` is embedded in a word (`abc#tec`)", () => {
    // 単語境界違反は paste rule / input rule と同じ扱いにする（受け入れ条件）。
    // Word-boundary violation matches the paste/input rule contract.
    const plugin = getPlugin();
    const state = makeParagraphState("abc#tec", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate after a `/` (URL-fragment style boundary)", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("/page#anchor", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate after a second `#` (`##heading`-like input)", () => {
    // `##` の 2 つ目の `#` 位置でも、直前が `#` のため起動しない。
    // `##` keeps the menu off — second `#` is preceded by another `#`.
    const plugin = getPlugin();
    const state = makeParagraphState("##heading", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate without any `#`", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("plain text", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate inside an inline `code` mark", () => {
    // `excludes: "code"` をプラグイン側でも担保する。コード内で `#` を打っても
    // サジェスト UI は出ない。
    // Plugin must mirror Tag mark's `excludes: "code"`: never activate inside
    // inline code so we don't tease an action that addMark would block.
    const plugin = getPlugin();
    const state = makeInlineCodeState("#tec", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate inside a code_block", () => {
    const plugin = getPlugin();
    const state = makeCodeBlockState("#tec", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate when the candidate name is excluded (numeric `#1`)", () => {
    // 入力規則と同じ除外（数字のみ・6/8 桁 hex）をサジェスト側でも適用する。
    // 数字オンリーのクエリではポップアップを出さない。
    // Mirror the input/paste rule exclusions (numeric-only / 6/8-char hex).
    // `#1` should not raise the picker.
    const plugin = getPlugin();
    const state = makeParagraphState("#1", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate when the candidate name is a 6-char pure hex (`#aabbcc`)", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("#aabbcc", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate when the candidate name is an 8-char pure hex (`#aabbccdd`)", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("#aabbccdd", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("activates while the user is still typing toward an excluded value (e.g. `#aabbc`)", () => {
    // 5 桁時点では除外ルール対象外（除外は 6/8 桁完成時のみ）。
    // The exclusion only kicks in at 6/8 chars; intermediate states still show.
    const plugin = getPlugin();
    const state = makeParagraphState("#aabbc", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("aabbc");
  });
});

describe("tagSuggestionPlugin — deactivation", () => {
  it("deactivates when the selection becomes a non-empty range", () => {
    const onStateChange = vi.fn();
    const plugin = getPlugin(onStateChange);

    let state = makeParagraphState("#tec", plugin);
    expect(tagSuggestionPluginKey.getState(state)?.active).toBe(true);
    onStateChange.mockClear();

    const tr = state.tr.setSelection(TextSelection.create(state.doc, 1, 5));
    state = state.apply(tr);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
    expect(pluginState?.range).toBeNull();
    expect(pluginState?.query).toBe("");
    expect(onStateChange).toHaveBeenCalledWith(pluginState);
  });

  it("turns off when the user types past the trigger and the regex no longer matches", () => {
    const plugin = getPlugin();

    let state = makeParagraphState("#tec", plugin);
    expect(tagSuggestionPluginKey.getState(state)?.active).toBe(true);

    // Replace the entire paragraph contents with text that no longer matches.
    // 段落全体を非トリガなテキストに差し替える（pos 1〜5 が段落内 4 文字 + 末尾位置）。
    const tr = state.tr.replaceWith(1, 5, schema.text("plain"));
    state = state.apply(tr);
    expect(tagSuggestionPluginKey.getState(state)?.active).toBe(false);
  });

  it("turns off when a terminator (space) is typed after the query", () => {
    // Esc を押さずに空白を打鍵すると、regex が末尾 `$` でマッチしなくなり
    // サジェストは閉じる（その後の確定は入力規則に任せる）。
    // Typing a terminator (space) breaks the `$`-anchored regex and closes the
    // popup. The input rule then takes over (Esc-then-terminator contract).
    const plugin = getPlugin();
    let state = makeParagraphState("#tec", plugin);
    expect(tagSuggestionPluginKey.getState(state)?.active).toBe(true);

    const tr = state.tr.insertText(" ", 5);
    state = state.apply(tr);
    expect(tagSuggestionPluginKey.getState(state)?.active).toBe(false);
  });

  it("explicit close meta clears the active state and notifies subscribers", () => {
    const onStateChange = vi.fn();
    const plugin = getPlugin(onStateChange);

    let state = makeParagraphState("#tec", plugin);
    expect(tagSuggestionPluginKey.getState(state)?.active).toBe(true);
    onStateChange.mockClear();

    const tr = state.tr.setMeta(tagSuggestionPluginKey, { close: true });
    state = state.apply(tr);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState).toEqual({
      active: false,
      query: "",
      range: null,
      decorations: expect.any(Object),
    });
    expect(onStateChange).toHaveBeenCalledWith(pluginState);
  });
});

describe("tagSuggestionPlugin — decorations", () => {
  it("creates a single `.tag-typing` decoration over the `#name` range when active", () => {
    // CSS の `.tag-typing` を生かすため、active 中は `#name` 範囲に inline
    // decoration を置く（issue #767 受け入れ条件、CSS は src/index.css に既存）。
    // Decorate the live `#name` range with `.tag-typing` so the existing CSS
    // colours the typing state (the class lives in src/index.css).
    const plugin = getPlugin();
    const state = makeParagraphState("#tec", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(true);

    const decos = pluginState?.decorations.find(0, state.doc.content.size) ?? [];
    expect(decos).toHaveLength(1);
    expect(decos[0].from).toBe(1);
    expect(decos[0].to).toBe(5);
  });

  it("returns an empty decoration set when inactive", () => {
    const plugin = getPlugin();
    const state = makeParagraphState("plain", plugin);
    const pluginState = tagSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
    const decos = pluginState?.decorations.find(0, state.doc.content.size) ?? [];
    expect(decos).toHaveLength(0);
  });
});

describe("tagSuggestionPlugin — extension wiring", () => {
  it("declares the expected extension name", () => {
    expect(TagSuggestionPlugin.name).toBe("tagSuggestion");
  });

  it("exposes a default options object with no callback", () => {
    const ext = TagSuggestionPlugin.configure();
    expect(ext.options.onStateChange).toBeUndefined();
  });
});
