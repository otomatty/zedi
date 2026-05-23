import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGlobalSearchShortcut } from "./useGlobalSearchShortcut";

/**
 * `KeyboardEvent` を dispatch するヘルパー。`cancelable: true` を必ず付け、
 * `preventDefault` がフラグに反映されるようにする。
 *
 * Dispatch helper that always sets `cancelable: true` so `preventDefault`
 * reflects on the returned event.
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

describe("useGlobalSearchShortcut", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Cmd+K で onOpen を呼び preventDefault する / triggers onOpen on Cmd+K with preventDefault", () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut(onOpen));

    const event = dispatchKeyDown({ key: "k", metaKey: true });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+K でも動く / also triggers on Ctrl+K", () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut(onOpen));

    const event = dispatchKeyDown({ key: "k", ctrlKey: true });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("他のリスナーが capture phase で preventDefault 済みなら onOpen を呼ばない / does not fire onOpen when an earlier capture-phase listener already preventDefault'd (issue #928)", () => {
    const onOpen = vi.fn();
    // 先に capture phase のリスナーを登録して preventDefault を発生させる。
    // これにより、エディタ側ショートカット（capture phase で登録される
    // useEditorWikiLinkShortcuts）が Cmd+K を消費した場合のグローバル検索の
    // 抑制契約を担保する。
    // Register a capture-phase listener that preventDefault's first to model
    // the editor shortcut. This pins the contract that the global search
    // bows out when the editor consumed the event (issue #928).
    const capturePreventer = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener("keydown", capturePreventer, true);

    try {
      renderHook(() => useGlobalSearchShortcut(onOpen));

      dispatchKeyDown({ key: "k", metaKey: true });

      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", capturePreventer, true);
    }
  });

  it("修飾キー無しの 'k' では発火しない / ignores plain 'k' without modifier", () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut(onOpen));

    const event = dispatchKeyDown({ key: "k" });

    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("unmount でリスナーが解除される / removes the listener on unmount", () => {
    const onOpen = vi.fn();
    const { unmount } = renderHook(() => useGlobalSearchShortcut(onOpen));

    unmount();
    dispatchKeyDown({ key: "k", metaKey: true });

    expect(onOpen).not.toHaveBeenCalled();
  });
});
