import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { useEditorWikiLinkShortcuts } from "@/hooks/wiki/useEditorWikiLinkShortcuts";

/**
 * テスト用のミニマル Editor モック。`isFocused` / `isEditable` / `state.selection`
 * を本フックが参照するためだけに最低限の形で公開する。
 *
 * Minimal `Editor` mock exposing only the surface `useEditorWikiLinkShortcuts`
 * reads: `isFocused`, `isEditable`, and `state.selection`.
 */
function createMockEditor(
  options: {
    isFocused?: boolean;
    isEditable?: boolean;
    selection?: { from: number; to: number };
  } = {},
): Editor {
  const { isFocused = true, isEditable = true, selection = { from: 5, to: 5 } } = options;
  return {
    isFocused,
    isEditable,
    state: { selection: { from: selection.from, to: selection.to } },
  } as unknown as Editor;
}

/**
 * `KeyboardEvent` を dispatch して `defaultPrevented` 結果を返すヘルパー。
 * `cancelable: true` を必ず付け、`preventDefault` の呼び出しがフラグに反映
 * されるようにする（jsdom）。
 *
 * Dispatch a `KeyboardEvent` and return whether `preventDefault` was called.
 * Always set `cancelable: true` so jsdom honors `preventDefault`.
 */
function dispatchKeyDown(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.dispatchEvent(event);
  return event;
}

describe("useEditorWikiLinkShortcuts - Cmd/Ctrl+K", () => {
  let focusInputBar: ReturnType<typeof vi.fn<() => void>>;
  let convertSelectionToWikiLink: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    focusInputBar = vi.fn<() => void>();
    convertSelectionToWikiLink = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  });

  it("Cmd+K (mac) を捕捉して focusInputBar を呼び preventDefault する / catches Cmd+K on mac and invokes focusInputBar with preventDefault", () => {
    const editor = createMockEditor({ isFocused: true });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "k", metaKey: true });

    expect(focusInputBar).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+K (windows/linux) を捕捉する / catches Ctrl+K cross-platform", () => {
    const editor = createMockEditor({ isFocused: true });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "k", ctrlKey: true });

    expect(focusInputBar).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("エディタ非フォーカス時は無視する（グローバル検索に委ねる） / ignores when editor is not focused so the global search shortcut wins", () => {
    const editor = createMockEditor({ isFocused: false });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "k", metaKey: true });

    expect(focusInputBar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("Cmd+Shift+K は捕捉しない（modifier 弁別） / does not capture Cmd+Shift+K (modifier discrimination)", () => {
    const editor = createMockEditor({ isFocused: true });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "k", metaKey: true, shiftKey: true });

    expect(focusInputBar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("Caps Lock で `event.key` が 'K' になっても捕捉する / matches uppercase 'K' too (Caps Lock without Shift) — Codex P2", () => {
    const editor = createMockEditor({ isFocused: true });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "K", metaKey: true });

    expect(focusInputBar).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Alt 併用は無視する / ignores when Alt is held", () => {
    const editor = createMockEditor({ isFocused: true });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "k", metaKey: true, altKey: true });

    expect(focusInputBar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("useEditorWikiLinkShortcuts - Cmd/Ctrl+Shift+L", () => {
  let focusInputBar: ReturnType<typeof vi.fn<() => void>>;
  let convertSelectionToWikiLink: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    focusInputBar = vi.fn<() => void>();
    convertSelectionToWikiLink = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  });

  it("非空選択時に convertSelectionToWikiLink を呼ぶ / invokes convertSelectionToWikiLink when selection is non-empty", () => {
    const editor = createMockEditor({ isFocused: true, selection: { from: 3, to: 8 } });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "L", metaKey: true, shiftKey: true });

    expect(convertSelectionToWikiLink).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+Shift+L もクロスプラットフォームで動く / Ctrl+Shift+L also fires cross-platform", () => {
    const editor = createMockEditor({ isFocused: true, selection: { from: 3, to: 8 } });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "L", ctrlKey: true, shiftKey: true });

    expect(convertSelectionToWikiLink).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("key が小文字 'l' でも shift と組み合わさっていれば反応する / matches both 'L' and 'l' when shift is held (some browsers/keymaps)", () => {
    const editor = createMockEditor({ isFocused: true, selection: { from: 1, to: 4 } });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "l", metaKey: true, shiftKey: true });

    expect(convertSelectionToWikiLink).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("選択範囲が空のときは no-op で preventDefault も呼ばない / no-op + does NOT preventDefault when selection is empty", () => {
    const editor = createMockEditor({ isFocused: true, selection: { from: 5, to: 5 } });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "L", metaKey: true, shiftKey: true });

    expect(convertSelectionToWikiLink).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("エディタ非フォーカス時は無視する / ignores when editor is not focused", () => {
    const editor = createMockEditor({ isFocused: false, selection: { from: 3, to: 8 } });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "L", metaKey: true, shiftKey: true });

    expect(convertSelectionToWikiLink).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("convertSelectionToWikiLink が reject しても unhandled rejection を出さない / swallows rejections from convertSelectionToWikiLink so the document keydown handler does not leak unhandled rejections (CodeRabbit / Gemini review)", async () => {
    const editor = createMockEditor({ isFocused: true, selection: { from: 3, to: 8 } });
    const rejection = new Error("boom");
    const rejecting = vi.fn().mockRejectedValue(rejection);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderHook(() =>
        useEditorWikiLinkShortcuts({
          editor,
          focusInputBar,
          convertSelectionToWikiLink: rejecting,
        }),
      );

      dispatchKeyDown({ key: "L", metaKey: true, shiftKey: true });

      // microtask まで待って catch が走ったことを確認する。
      // Flush microtasks so the catch handler runs.
      await Promise.resolve();
      await Promise.resolve();

      expect(rejecting).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("Shift 無しの Cmd+L は捕捉しない / does not capture Cmd+L without Shift", () => {
    const editor = createMockEditor({ isFocused: true, selection: { from: 3, to: 8 } });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "l", metaKey: true });

    expect(convertSelectionToWikiLink).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("useEditorWikiLinkShortcuts - 共通ガード / shared guards", () => {
  let focusInputBar: ReturnType<typeof vi.fn<() => void>>;
  let convertSelectionToWikiLink: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    focusInputBar = vi.fn<() => void>();
    convertSelectionToWikiLink = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  });

  it("editor が null のときは何もしない / no-op when editor is null", () => {
    renderHook(() =>
      useEditorWikiLinkShortcuts({
        editor: null,
        focusInputBar,
        convertSelectionToWikiLink,
      }),
    );

    const event = dispatchKeyDown({ key: "k", metaKey: true });

    expect(focusInputBar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("editor.isEditable が false なら何もしない / no-op when editor is not editable", () => {
    const editor = createMockEditor({ isFocused: true, isEditable: false });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "k", metaKey: true });

    expect(focusInputBar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("isReadOnly が true なら何もしない / no-op when isReadOnly is true", () => {
    const editor = createMockEditor({ isFocused: true });
    renderHook(() =>
      useEditorWikiLinkShortcuts({
        editor,
        focusInputBar,
        convertSelectionToWikiLink,
        isReadOnly: true,
      }),
    );

    const event = dispatchKeyDown({ key: "k", metaKey: true });

    expect(focusInputBar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("IME 変換中 (isComposing) は何もしない / no-op while IME composition is active", () => {
    const editor = createMockEditor({ isFocused: true, selection: { from: 1, to: 4 } });
    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    const event = dispatchKeyDown({ key: "k", metaKey: true, isComposing: true });
    const event2 = dispatchKeyDown({ key: "L", metaKey: true, shiftKey: true, isComposing: true });

    expect(focusInputBar).not.toHaveBeenCalled();
    expect(convertSelectionToWikiLink).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(event2.defaultPrevented).toBe(false);
  });

  it("unmount でリスナーが解除される / removes the document listener on unmount", () => {
    const editor = createMockEditor({ isFocused: true });
    const { unmount } = renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );

    unmount();

    const event = dispatchKeyDown({ key: "k", metaKey: true });

    expect(focusInputBar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("後から登録された bubble phase リスナーより先に走り、event 伝播を止める / runs before later-registered bubble-phase listeners and stops propagation so they do not fire (issue #928 collision guard)", () => {
    const editor = createMockEditor({ isFocused: true });
    const laterBubbleListener = vi.fn();

    renderHook(() =>
      useEditorWikiLinkShortcuts({ editor, focusInputBar, convertSelectionToWikiLink }),
    );
    // capture phase 登録の後に追加された bubble phase リスナーは、capture が
    // stopPropagation を呼んだら呼ばれない。これにより `useGlobalSearchShortcut`
    // のような既存の document リスナーをエディタ側が優先できる。
    // A bubble-phase listener registered after the hook should not fire when
    // the hook's capture handler stops propagation — this is what lets the
    // editor shortcut preempt the global search shortcut.
    document.addEventListener("keydown", laterBubbleListener);

    try {
      act(() => {
        dispatchKeyDown({ key: "k", metaKey: true });
      });

      expect(focusInputBar).toHaveBeenCalledTimes(1);
      expect(laterBubbleListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", laterBubbleListener);
    }
  });
});
