import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

// `react-i18next` を素通りモック。
// Pass-through i18n mock.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `useBubbleMenuWikiLink` は内部で API 問い合わせが走るためここでは無効化し、
// テストの主目的（表示/非表示・ボタン配線）に集中する。
// Stub out wiki-link existence checking so we can focus on visibility and
// the button wiring without spinning up the page-queries hook.
vi.mock("@/hooks/pages/usePageQueries", () => ({
  useWikiLinkExistsChecker: () => ({
    checkExistence: vi.fn().mockResolvedValue({
      pageTitles: new Set(),
      referencedTitles: new Set(),
      pageTitleToId: new Map(),
    }),
  }),
}));

// キーボードオフセットは別の hook で検証済みのため、本コンポーネントの
// テストでは固定値を返すモックに置き換える。
// Keyboard offset is exercised by its own hook test; here we stub it so we
// can assert the sheet just applies the value verbatim.
let mockKeyboardOffset = 0;
vi.mock("@/hooks/useVirtualKeyboardOffset", () => ({
  useVirtualKeyboardOffset: () => mockKeyboardOffset,
}));

import { MobileSelectionSheet } from "./MobileSelectionSheet";

interface EditorMockOptions {
  selectionEmpty?: boolean;
  hasFocus?: boolean;
  isEditable?: boolean;
  activeMarks?: ReadonlySet<string>;
}

/**
 * 表示判定とボタン配線を検証するための最小エディタモック。
 * - `on/off` で `selectionUpdate` / `focus` / `blur` を購読できる
 * - `setActive`/`setHasFocus` でテストから内部状態を切り替えて `fireEvents` で通知
 * - `chain().focus().toggleX().run()` のチェーンを vi.fn() で観測する
 *
 * Minimal editor mock for the visibility logic and button wiring. Supports
 * subscribing to selectionUpdate / focus / blur, mutating state, and
 * observing chain command invocations via vi.fn().
 */
function createMockEditor(initial: EditorMockOptions = {}) {
  let selectionEmpty = initial.selectionEmpty ?? false;
  let hasFocus = initial.hasFocus ?? true;
  let isEditable = initial.isEditable ?? true;
  let activeMarks = new Set<string>(initial.activeMarks ?? []);
  const listeners = new Map<string, Set<() => void>>();

  const run = vi.fn();
  const chainable = {
    focus: vi.fn(() => chainable),
    toggleBold: vi.fn(() => chainable),
    toggleItalic: vi.fn(() => chainable),
    toggleStrike: vi.fn(() => chainable),
    toggleCode: vi.fn(() => chainable),
    deleteRange: vi.fn(() => chainable),
    insertContent: vi.fn(() => chainable),
    unsetWikiLink: vi.fn(() => chainable),
    run,
  };

  const editor = {
    isActive: (name: string) => activeMarks.has(name),
    get isEditable() {
      return isEditable;
    },
    state: {
      get selection() {
        return { empty: selectionEmpty, from: 0, to: 0 };
      },
      doc: { textBetween: () => "selected" },
    },
    view: { hasFocus: () => hasFocus },
    chain: () => chainable,
    on(event: string, cb: () => void) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(cb);
    },
    off(event: string, cb: () => void) {
      listeners.get(event)?.delete(cb);
    },
  } as unknown as Editor;

  const fire = (event: string) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of set) cb();
  };

  return {
    editor,
    chainable,
    runMock: run,
    setSelectionEmpty(v: boolean) {
      selectionEmpty = v;
    },
    setHasFocus(v: boolean) {
      hasFocus = v;
    },
    setIsEditable(v: boolean) {
      isEditable = v;
    },
    setActiveMarks(marks: Iterable<string>) {
      activeMarks = new Set(marks);
    },
    fire,
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

describe("MobileSelectionSheet", () => {
  beforeEach(() => {
    mockKeyboardOffset = 0;
  });

  it("選択が空かつ wikiLink でないときは描画しない / does not render with empty non-wikiLink selection", () => {
    const m = createMockEditor({ selectionEmpty: true, hasFocus: true });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.queryByTestId("mobile-selection-sheet")).not.toBeInTheDocument();
  });

  it("選択があるときに描画する / renders when there is a non-empty selection", () => {
    const m = createMockEditor({ selectionEmpty: false, hasFocus: true });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.getByTestId("mobile-selection-sheet")).toBeInTheDocument();
  });

  it("選択が空でも wikiLink アクティブなら描画する / shows on caret inside a wikiLink", () => {
    const m = createMockEditor({
      selectionEmpty: true,
      hasFocus: true,
      activeMarks: new Set(["wikiLink"]),
    });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.getByTestId("mobile-selection-sheet")).toBeInTheDocument();
  });

  it("コードブロック内では描画しない / hides while caret is inside a codeBlock", () => {
    const m = createMockEditor({
      selectionEmpty: false,
      hasFocus: true,
      activeMarks: new Set(["codeBlock"]),
    });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.queryByTestId("mobile-selection-sheet")).not.toBeInTheDocument();
  });

  it("エディタが編集不可なら描画しない / hides while the editor is not editable", () => {
    const m = createMockEditor({ selectionEmpty: false, isEditable: false });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.queryByTestId("mobile-selection-sheet")).not.toBeInTheDocument();
  });

  it("選択解除イベントで閉じる / closes when the user clears the selection", () => {
    const m = createMockEditor({ selectionEmpty: false, hasFocus: true });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.getByTestId("mobile-selection-sheet")).toBeInTheDocument();

    act(() => {
      m.setSelectionEmpty(true);
      m.fire("selectionUpdate");
    });

    expect(screen.queryByTestId("mobile-selection-sheet")).not.toBeInTheDocument();
  });

  it("blur で閉じ、focus で再表示する / hides on blur and shows again on focus", () => {
    const m = createMockEditor({ selectionEmpty: false, hasFocus: true });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.getByTestId("mobile-selection-sheet")).toBeInTheDocument();

    act(() => {
      m.setHasFocus(false);
      m.fire("blur");
    });
    expect(screen.queryByTestId("mobile-selection-sheet")).not.toBeInTheDocument();

    act(() => {
      m.setHasFocus(true);
      m.fire("focus");
    });
    expect(screen.getByTestId("mobile-selection-sheet")).toBeInTheDocument();
  });

  it("unmount でエディタリスナーを解除する / detaches editor listeners on unmount", () => {
    const m = createMockEditor({ selectionEmpty: false });
    const { unmount } = render(<MobileSelectionSheet editor={m.editor} />);
    expect(m.listenerCount("selectionUpdate")).toBeGreaterThan(0);
    unmount();
    expect(m.listenerCount("selectionUpdate")).toBe(0);
    expect(m.listenerCount("focus")).toBe(0);
    expect(m.listenerCount("blur")).toBe(0);
  });

  it("editor が null のときは何も描画しない / renders nothing when editor is null", () => {
    render(<MobileSelectionSheet editor={null} />);
    expect(screen.queryByTestId("mobile-selection-sheet")).not.toBeInTheDocument();
  });

  it("キーボード高さ分だけ bottom をオフセットする / lifts the sheet by the keyboard offset", () => {
    mockKeyboardOffset = 320;
    const m = createMockEditor({ selectionEmpty: false, hasFocus: true });
    render(<MobileSelectionSheet editor={m.editor} />);
    const sheet = screen.getByTestId("mobile-selection-sheet");
    expect(sheet.style.bottom).toBe("320px");
  });

  it("Bold / Italic / Strike / Code / WikiLink の 5 アクションを描画する / renders the five required actions", () => {
    const m = createMockEditor({ selectionEmpty: false, hasFocus: true });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.getByRole("button", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /italic/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /strike/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /code/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wiki link/i })).toBeInTheDocument();
  });

  it("Bold ボタンで toggleBold が呼ばれる / clicking Bold runs toggleBold", () => {
    const m = createMockEditor({ selectionEmpty: false, hasFocus: true });
    render(<MobileSelectionSheet editor={m.editor} />);
    fireEvent.click(screen.getByRole("button", { name: /bold/i }));
    expect(m.chainable.toggleBold).toHaveBeenCalled();
    expect(m.runMock).toHaveBeenCalled();
  });

  it("wikiLink アクティブ時は解除ボタンを出す / shows the unset button when caret is inside a wikiLink", () => {
    const m = createMockEditor({
      selectionEmpty: true,
      hasFocus: true,
      activeMarks: new Set(["wikiLink"]),
    });
    render(<MobileSelectionSheet editor={m.editor} />);
    expect(screen.getByRole("button", { name: /unset wiki link/i })).toBeInTheDocument();
  });
});
