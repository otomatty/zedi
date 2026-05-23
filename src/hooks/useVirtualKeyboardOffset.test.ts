import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVirtualKeyboardOffset } from "./useVirtualKeyboardOffset";

/**
 * `window.visualViewport` のモック。jsdom には未実装のため、テストの中で
 * 手動でリスナーを発火させてキーボード表示・非表示の遷移を再現する。
 *
 * Mock helper for `window.visualViewport` because jsdom does not implement
 * the API. Tests use `setMetrics` + `fire` to simulate keyboard show/hide.
 */
interface MockVisualViewport {
  height: number;
  offsetTop: number;
  width: number;
  scale: number;
  pageLeft: number;
  pageTop: number;
  offsetLeft: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

function installMockVisualViewport(): {
  vv: MockVisualViewport;
  listeners: Map<string, Set<EventListener>>;
  fire: (type: string) => void;
  setMetrics: (next: { height: number; offsetTop?: number }) => void;
  restore: () => void;
} {
  const listeners = new Map<string, Set<EventListener>>();
  const vv: MockVisualViewport = {
    height: 800,
    offsetTop: 0,
    width: 400,
    scale: 1,
    pageLeft: 0,
    pageTop: 0,
    offsetLeft: 0,
    addEventListener: vi.fn((type: string, cb: EventListener) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: EventListener) => {
      listeners.get(type)?.delete(cb);
    }),
    dispatchEvent: vi.fn(),
  };
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, "visualViewport");
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: vv,
  });
  const originalInnerHeight = window.innerHeight;
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
  return {
    vv,
    listeners,
    fire: (type: string) => {
      const set = listeners.get(type);
      if (!set) return;
      for (const cb of set) cb(new Event(type));
    },
    setMetrics: ({ height, offsetTop = 0 }) => {
      vv.height = height;
      vv.offsetTop = offsetTop;
    },
    restore: () => {
      if (originalDescriptor) {
        Object.defineProperty(window, "visualViewport", originalDescriptor);
      } else {
        // jsdom の既定では visualViewport プロパティ自体が無いので削除する。
        // jsdom has no default `visualViewport`, so drop the property when restoring.
        delete (window as unknown as { visualViewport?: unknown }).visualViewport;
      }
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    },
  };
}

describe("useVirtualKeyboardOffset", () => {
  let env: ReturnType<typeof installMockVisualViewport>;

  beforeEach(() => {
    env = installMockVisualViewport();
  });

  afterEach(() => {
    env.restore();
  });

  it("active=false ではリスナーを登録せずオフセットは 0 を返す / does not attach listeners and returns 0 when inactive", () => {
    const { result } = renderHook(() => useVirtualKeyboardOffset(false));
    expect(result.current).toBe(0);
    expect(env.vv.addEventListener).not.toHaveBeenCalled();
  });

  it("active=true で resize / scroll リスナーを登録する / attaches resize + scroll listeners while active", () => {
    renderHook(() => useVirtualKeyboardOffset(true));
    expect(env.vv.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(env.vv.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("初期マウント時に visualViewport の現在値からオフセットを計算する / computes initial offset from visualViewport on mount", () => {
    // キーボードが既に表示されている状態（800 − 500 = 300px）で active=true になる場合。
    // The keyboard is already up when the hook activates (800 − 500 = 300px gap).
    env.setMetrics({ height: 500 });
    const { result } = renderHook(() => useVirtualKeyboardOffset(true));
    expect(result.current).toBe(300);
  });

  it("resize イベントでキーボード高さが更新される / updates offset when resize fires", () => {
    const { result } = renderHook(() => useVirtualKeyboardOffset(true));
    expect(result.current).toBe(0);
    act(() => {
      env.setMetrics({ height: 460 });
      env.fire("resize");
    });
    expect(result.current).toBe(340);
  });

  it("offsetTop を引いて純粋なキーボード高さだけを返す / subtracts offsetTop so the value is purely keyboard height", () => {
    const { result } = renderHook(() => useVirtualKeyboardOffset(true));
    act(() => {
      // 例: iOS でピンチズーム + スクロール状態。height 600, offsetTop 50, layout 800
      // → キーボードは 800 - 600 - 50 = 150px。
      // Example: iOS pinch-zoomed and scrolled. The bottom inset is
      // `innerHeight - vv.height - vv.offsetTop = 150`.
      env.setMetrics({ height: 600, offsetTop: 50 });
      env.fire("resize");
    });
    expect(result.current).toBe(150);
  });

  it("計算結果が負になっても 0 にクランプする / clamps negative results to 0 (e.g. layout viewport shrank itself on Android)", () => {
    const { result } = renderHook(() => useVirtualKeyboardOffset(true));
    act(() => {
      // Android Chrome のデフォルトでは window.innerHeight も縮むため、
      // visualViewport.height のほうが大きく見えることがある。
      // On Android Chrome with default resize behavior, `window.innerHeight`
      // can shrink to match or exceed `visualViewport.height`.
      env.setMetrics({ height: 820 });
      env.fire("resize");
    });
    expect(result.current).toBe(0);
  });

  it("active=true → false でリスナーを解除しオフセットを 0 に戻す / unregisters listeners and resets to 0 when active flips false", () => {
    env.setMetrics({ height: 500 });
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useVirtualKeyboardOffset(active),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(300);

    rerender({ active: false });
    expect(result.current).toBe(0);
    expect(env.vv.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(env.vv.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("unmount でリスナーを解除する / removes listeners on unmount", () => {
    const { unmount } = renderHook(() => useVirtualKeyboardOffset(true));
    unmount();
    expect(env.vv.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(env.vv.removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("visualViewport が未定義の環境では 0 のまま落ちない / stays at 0 without throwing when visualViewport is unavailable", () => {
    env.restore();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useVirtualKeyboardOffset(true));
    expect(result.current).toBe(0);
  });
});
