import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

// react-i18next を素通りモック（他テストと同じパターン）。
// Mirror the lightweight i18n stub used elsewhere in this file's siblings.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/wiki/useWikiLinkCandidates", () => ({
  useWikiLinkCandidates: () => ({ pages: [], isLoading: false }),
}));

vi.mock("@/hooks/pages/usePageQueries", () => ({
  useWikiLinkExistsChecker: () => ({
    checkExistence: vi.fn().mockResolvedValue({
      pageTitles: new Set(),
      referencedTitles: new Set(),
      pageTitleToId: new Map(),
    }),
  }),
  useCheckGhostLinkReferenced: () => ({ checkReferenced: vi.fn().mockResolvedValue(false) }),
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useIsMobile: vi.fn(() => true),
  };
});

import type { Editor } from "@tiptap/core";
import { useIsMobile } from "@zedi/ui";
import { FloatingWikiLinkInputBar } from "./FloatingWikiLinkInputBar";
import { PageActionHubFab } from "./PageActionHub/PageActionHubFab";

/**
 * 最小限のエディタモック。`WikiLinkInputBar` が `disabled={!editor}` で
 * 入力欄を無効化するため、focus 動作を確かめるには truthy なエディタ
 * オブジェクトが必要。
 *
 * Minimal editor mock — the bar disables its input when `editor` is null,
 * so we need *some* truthy editor to test focus behavior.
 */
function createDummyEditor(): Editor {
  return {
    state: { selection: { from: 0, to: 0 } },
    chain: () => ({
      focus: () => ({
        insertContentAt: () => ({
          setTextSelection: () => ({ run: vi.fn() }),
          run: vi.fn(),
        }),
        run: vi.fn(),
      }),
    }),
    commands: { focus: vi.fn() },
  } as unknown as Editor;
}

interface MockVisualViewport {
  height: number;
  offsetTop: number;
  addEventListener: (type: string, cb: EventListener) => void;
  removeEventListener: (type: string, cb: EventListener) => void;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

function installMockVisualViewport(): {
  setMetrics: (next: { height: number; offsetTop?: number }) => void;
  fire: (type: string) => void;
  restore: () => void;
} {
  const listeners = new Map<string, Set<EventListener>>();
  const vv: MockVisualViewport = {
    height: 800,
    offsetTop: 0,
    addEventListener: (type, cb) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(cb);
    },
    removeEventListener: (type, cb) => {
      listeners.get(type)?.delete(cb);
    },
    dispatchEvent: vi.fn(),
  };
  const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
  const originalInnerHeight = window.innerHeight;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  return {
    setMetrics: ({ height, offsetTop = 0 }) => {
      vv.height = height;
      vv.offsetTop = offsetTop;
    },
    fire: (type) => {
      const set = listeners.get(type);
      if (!set) return;
      for (const cb of set) cb(new Event(type));
    },
    restore: () => {
      if (original) {
        Object.defineProperty(window, "visualViewport", original);
      } else {
        delete (window as unknown as { visualViewport?: unknown }).visualViewport;
      }
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    },
  };
}

describe("FloatingWikiLinkInputBar - visualViewport 追従 / virtual keyboard tracking", () => {
  let env: ReturnType<typeof installMockVisualViewport>;

  beforeEach(() => {
    env = installMockVisualViewport();
    vi.mocked(useIsMobile).mockReturnValue(true);
  });

  afterEach(() => {
    env.restore();
  });

  it("初期状態ではキーボードオフセットを適用せず通常配置 / does not apply a keyboard offset before focus", () => {
    render(<FloatingWikiLinkInputBar editor={createDummyEditor()} pageId="p1" pageNoteId={null} />);
    const wrapper = screen.getByTestId("floating-wiki-link-input-bar");
    expect(wrapper.style.bottom).toBe("");
  });

  it("入力欄フォーカス時にキーボード高さ分だけ bottom をオフセットする / lifts the bar by the keyboard height once the input is focused", () => {
    env.setMetrics({ height: 460 });
    render(<FloatingWikiLinkInputBar editor={createDummyEditor()} pageId="p1" pageNoteId={null} />);
    const wrapper = screen.getByTestId("floating-wiki-link-input-bar");
    const input = screen.getByTestId("wiki-link-input-bar-input");

    act(() => {
      input.focus();
    });

    // window.innerHeight 800 − vv.height 460 − offsetTop 0 = 340px
    expect(wrapper.style.bottom).toBe("340px");
  });

  it("キーボード高さ変化（resize）に追従する / follows visualViewport resize while focused", () => {
    render(<FloatingWikiLinkInputBar editor={createDummyEditor()} pageId="p1" pageNoteId={null} />);
    const wrapper = screen.getByTestId("floating-wiki-link-input-bar");
    const input = screen.getByTestId("wiki-link-input-bar-input");

    act(() => {
      input.focus();
    });
    expect(wrapper.style.bottom).toBe("");

    act(() => {
      env.setMetrics({ height: 500 });
      env.fire("resize");
    });
    expect(wrapper.style.bottom).toBe("300px");

    // 横向き等でさらに変わるケース。
    // Orientation change / keyboard variant swap — value updates again.
    act(() => {
      env.setMetrics({ height: 600 });
      env.fire("resize");
    });
    expect(wrapper.style.bottom).toBe("200px");
  });

  it("blur 後もキーボードが残る間はオフセットを維持し、閉じたら戻る / keeps the offset until the keyboard closes, not on input blur", () => {
    env.setMetrics({ height: 500 });
    render(<FloatingWikiLinkInputBar editor={createDummyEditor()} pageId="p1" pageNoteId={null} />);
    const wrapper = screen.getByTestId("floating-wiki-link-input-bar");
    const input = screen.getByTestId("wiki-link-input-bar-input");

    act(() => {
      input.focus();
    });
    expect(wrapper.style.bottom).toBe("300px");

    act(() => {
      fireEvent.blur(input, { relatedTarget: null });
    });
    expect(wrapper.style.bottom).toBe("300px");

    act(() => {
      env.setMetrics({ height: 800 });
      env.fire("resize");
    });
    expect(wrapper.style.bottom).toBe("");
  });

  it("デスクトップで FAB クリックしてもキーボード追従を開始しない / does not start keyboard tracking when the FAB is clicked on desktop", async () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    env.setMetrics({ height: 460 });

    render(
      <FloatingWikiLinkInputBar
        editor={createDummyEditor()}
        pageId="p1"
        pageNoteId={null}
        trailingAction={<PageActionHubFab canEdit isSignedIn onOpen={vi.fn()} />}
      />,
    );

    const wrapper = screen.getByTestId("floating-wiki-link-input-bar");
    expect(wrapper.style.bottom).toBe("");

    await act(async () => {
      screen.getByTestId("page-action-hub-fab").click();
    });
    expect(wrapper.style.bottom).toBe("");
  });
});
