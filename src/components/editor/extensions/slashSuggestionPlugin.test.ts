/**
 * Tests for the `/` slash suggestion ProseMirror plugin.
 * `/` スラッシュサジェスト用 ProseMirror プラグインのテスト。
 *
 * The plugin tracks slash queries triggered at the start of a line or after a
 * space, and notifies subscribers when its state changes. These tests build a
 * minimal ProseMirror schema + state and feed transactions directly so we can
 * pin the trigger conditions without a full Tiptap editor.
 * 行頭またはスペース直後の `/` を検知する。最小スキーマ + 直接トランザクション
 * 適用でトリガ条件を固定する。
 */

import type { Plugin } from "@tiptap/pm/state";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";
import {
  SlashSuggestionPlugin,
  slashSuggestionPluginKey,
  type SlashSuggestionState,
} from "./slashSuggestionPlugin";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "text*",
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
  },
});

/**
 * Pulls the bare ProseMirror plugin out of the Tiptap extension wrapper so we
 * can install it on a hand-built `EditorState`.
 * Tiptap 拡張ラッパーから素の ProseMirror プラグインを取り出す。
 */
function getPlugin(onStateChange?: (s: SlashSuggestionState) => void): Plugin {
  const extension = SlashSuggestionPlugin.configure({ onStateChange });
  const addPlugins = extension.config.addProseMirrorPlugins;
  if (!addPlugins) throw new Error("addProseMirrorPlugins missing");
  // Tiptap stores extension options on `this.options` inside the method.
  // 拡張内部の `this.options` 経由で onStateChange を渡す必要がある。
  const plugins = addPlugins.call({ options: { onStateChange } } as never);
  return plugins[0];
}

/**
 * Creates an editor state seeded with `text` inside a single paragraph and a
 * collapsed cursor at the end of that text.
 * 1 段落のみのドキュメントを生成し、キャレットを末尾に置く。
 */
function makeState(text: string, plugin: Plugin): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
  const state = EditorState.create({ doc, schema, plugins: [plugin] });
  // 段落内末尾にキャレットを置く: pos 1 が段落 open、pos 1+text.length が末尾。
  // Place the caret at the end of the paragraph (pos 1 + text length).
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length));
  return state.apply(tr);
}

describe("slashSuggestionPlugin — initial state", () => {
  it("initialises with no active suggestion", () => {
    const plugin = getPlugin();
    const state = makeState("", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);
    expect(pluginState).toEqual({
      active: false,
      query: "",
      range: null,
      decorations: expect.any(Object),
    });
  });
});

describe("slashSuggestionPlugin — activation triggers", () => {
  it("activates on `/` at the start of a line", () => {
    const onStateChange = vi.fn();
    const plugin = getPlugin(onStateChange);
    const state = makeState("/", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);

    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("");
    // `/` 自体は pos 1〜2 の範囲。range はメニュー削除に再利用される。
    // The slash itself sits at positions 1..2; range is later used to delete it.
    expect(pluginState?.range).toEqual({ from: 1, to: 2 });
    expect(onStateChange).toHaveBeenCalledWith(pluginState);
  });

  it("captures the query text after `/`", () => {
    const plugin = getPlugin();
    const state = makeState("/analyze", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);

    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("analyze");
    expect(pluginState?.range).toEqual({ from: 1, to: 9 });
  });

  it("activates on a `/` preceded by a space mid-line", () => {
    const plugin = getPlugin();
    const state = makeState("hi /run", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);

    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("run");
    // "hi " (3 chars) → `/` at pos 4, query ends at pos 8.
    // 行頭ではなくスペース直後の `/` も同様に検知する。
    expect(pluginState?.range).toEqual({ from: 4, to: 8 });
  });

  it("preserves spaces inside the query so multi-token args stay active", () => {
    // `/analyze path/to/file` のような入力を維持する設計（コードコメント参照）。
    // Multi-word args after the command must keep the menu open.
    const plugin = getPlugin();
    const state = makeState("/analyze src/foo.ts", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);

    expect(pluginState?.active).toBe(true);
    expect(pluginState?.query).toBe("analyze src/foo.ts");
  });
});

describe("slashSuggestionPlugin — non-trigger inputs", () => {
  it("does not activate when `/` is embedded in a word", () => {
    const plugin = getPlugin();
    const state = makeState("foo/bar", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });

  it("does not activate without any `/`", () => {
    const plugin = getPlugin();
    const state = makeState("plain text", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
  });
});

describe("slashSuggestionPlugin — deactivation", () => {
  it("deactivates when the selection becomes a non-empty range", () => {
    const onStateChange = vi.fn();
    const plugin = getPlugin(onStateChange);

    // 1) Activate with `/foo`.
    let state = makeState("/foo", plugin);
    expect(slashSuggestionPluginKey.getState(state)?.active).toBe(true);
    onStateChange.mockClear();

    // 2) Expand the selection to a range; the plugin must turn off.
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 1, 5));
    state = state.apply(tr);
    const pluginState = slashSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
    expect(pluginState?.range).toBeNull();
    expect(pluginState?.query).toBe("");
    expect(onStateChange).toHaveBeenCalledWith(pluginState);
  });

  it("stays inactive when a non-empty selection is applied from an inactive state", () => {
    const onStateChange = vi.fn();
    const plugin = getPlugin(onStateChange);

    let state = makeState("hello", plugin);
    expect(slashSuggestionPluginKey.getState(state)?.active).toBe(false);
    onStateChange.mockClear();

    const tr = state.tr.setSelection(TextSelection.create(state.doc, 1, 4));
    state = state.apply(tr);
    expect(slashSuggestionPluginKey.getState(state)?.active).toBe(false);
    // 既に inactive のため通知しない（不要な再描画を避ける）。
    // No notification when already inactive — avoids redundant re-renders.
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("turns off when the user types past the slash trigger and the regex no longer matches", () => {
    const plugin = getPlugin();

    // Active first.
    let state = makeState("/foo", plugin);
    expect(slashSuggestionPluginKey.getState(state)?.active).toBe(true);

    // Replace the entire paragraph contents with text that no longer matches.
    // 段落全体を非トリガなテキストに差し替える（pos 1〜5 が段落内 4 文字 + 末尾位置）。
    const tr = state.tr.replaceWith(1, 5, schema.text("plain"));
    state = state.apply(tr);
    expect(slashSuggestionPluginKey.getState(state)?.active).toBe(false);
  });

  it("explicit close meta clears the active state and notifies subscribers", () => {
    const onStateChange = vi.fn();
    const plugin = getPlugin(onStateChange);

    let state = makeState("/foo", plugin);
    expect(slashSuggestionPluginKey.getState(state)?.active).toBe(true);
    onStateChange.mockClear();

    const tr = state.tr.setMeta(slashSuggestionPluginKey, { close: true });
    state = state.apply(tr);
    const pluginState = slashSuggestionPluginKey.getState(state);
    expect(pluginState).toEqual({
      active: false,
      query: "",
      range: null,
      decorations: expect.any(Object),
    });
    expect(onStateChange).toHaveBeenCalledWith(pluginState);
  });
});

describe("slashSuggestionPlugin — decorations", () => {
  it("creates a single decoration over the slash range when active", () => {
    const plugin = getPlugin();
    const state = makeState("/run", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(true);

    // DecorationSet.find returns all decorations overlapping the document.
    // 装飾が `/run` 範囲（pos 1〜5）を覆っていることを確認する。
    const decos = pluginState?.decorations.find(0, state.doc.content.size) ?? [];
    expect(decos).toHaveLength(1);
    expect(decos[0].from).toBe(1);
    expect(decos[0].to).toBe(5);
  });

  it("returns an empty decoration set when inactive", () => {
    const plugin = getPlugin();
    const state = makeState("plain", plugin);
    const pluginState = slashSuggestionPluginKey.getState(state);
    expect(pluginState?.active).toBe(false);
    const decos = pluginState?.decorations.find(0, state.doc.content.size) ?? [];
    expect(decos).toHaveLength(0);
  });
});

describe("slashSuggestionPlugin — extension wiring", () => {
  it("declares the expected extension name", () => {
    expect(SlashSuggestionPlugin.name).toBe("slashSuggestion");
  });

  it("exposes a default options object with no callback", () => {
    const ext = SlashSuggestionPlugin.configure();
    expect(ext.options.onStateChange).toBeUndefined();
  });
});
