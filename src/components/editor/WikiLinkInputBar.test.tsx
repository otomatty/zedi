import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";

// `react-i18next` の `useTranslation` をスタブして、JSON キーをそのまま返す
// ように振る舞わせる。これにより i18n プロバイダを用意せずに表示文字列の
// アサーションができる（他テストでも採用されている軽量パターン）。
// Stub `useTranslation` so it returns the key verbatim; lets us assert on
// rendered strings without setting up the i18n provider (matches the lightweight
// pattern used elsewhere in this repo).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseWikiLinkCandidates = vi.fn();
vi.mock("@/hooks/useWikiLinkCandidates", () => ({
  useWikiLinkCandidates: (noteId: string | null) => mockUseWikiLinkCandidates(noteId),
}));

const mockCheckExistence = vi.fn();
const mockCheckReferenced = vi.fn();
const mockUseWikiLinkExistsChecker = vi.fn(() => ({ checkExistence: mockCheckExistence }));
vi.mock("@/hooks/usePageQueries", () => ({
  useWikiLinkExistsChecker: (options: unknown) => mockUseWikiLinkExistsChecker(options),
  useCheckGhostLinkReferenced: () => ({ checkReferenced: mockCheckReferenced }),
}));

import { WikiLinkInputBar } from "./WikiLinkInputBar";

interface MockChainReturn {
  focus: ReturnType<typeof vi.fn>;
  insertContentAt: ReturnType<typeof vi.fn>;
  setTextSelection: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

interface MockEditor extends Editor {
  chainReturn: MockChainReturn;
  commandsReturn: { focus: ReturnType<typeof vi.fn> };
}

function createMockEditor(
  options: { selectionFrom?: number; selectionTo?: number } = {},
): MockEditor {
  const { selectionFrom = 5, selectionTo = 5 } = options;
  const run = vi.fn();
  const focusChain: ReturnType<typeof vi.fn> = vi.fn().mockReturnThis();
  const insertContentAt: ReturnType<typeof vi.fn> = vi.fn().mockReturnThis();
  const setTextSelection: ReturnType<typeof vi.fn> = vi.fn().mockReturnThis();
  const chainReturn: MockChainReturn = {
    focus: focusChain,
    insertContentAt,
    setTextSelection,
    run,
  };
  const commandsReturn = { focus: vi.fn() };
  const editor = {
    state: {
      selection: { from: selectionFrom, to: selectionTo },
    },
    chain: vi.fn(() => chainReturn),
    commands: commandsReturn,
    chainReturn,
    commandsReturn,
  } as unknown as MockEditor;
  return editor;
}

describe("WikiLinkInputBar - 基本表示 / basic rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWikiLinkCandidates.mockReturnValue({ pages: [], isLoading: false });
    mockUseWikiLinkExistsChecker.mockImplementation(() => ({
      checkExistence: mockCheckExistence,
    }));
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(),
      referencedTitles: new Set(),
      pageTitleToId: new Map(),
    });
    mockCheckReferenced.mockResolvedValue(false);
  });

  it("プレースホルダ『ページを作成』と aria-label を持つ入力欄を描画する / renders the input with the placeholder + aria-label i18n keys", () => {
    const editor = createMockEditor();
    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    const input = screen.getByTestId("wiki-link-input-bar-input") as HTMLInputElement;
    // i18n キーは `useTranslation` モックで素通りするため、キー自体が
    // placeholder / aria-label として現れる。値そのものは `common.json` 側の
    // テキスト。Accessible-name の i18n key 連結が崩れていないことを担保する。
    // The `useTranslation` mock passes keys through, so the placeholder and
    // aria-label show up as the i18n keys themselves. Pinning both keys keeps
    // the accessible-name spec from silently regressing.
    expect(input.placeholder).toBe("common.wikiLinkInputBar.placeholder");
    expect(input.getAttribute("aria-label")).toBe("common.wikiLinkInputBar.ariaLabel");
  });

  it("入力が空のときはサジェストを描画しない / does not render the suggestion list when input is empty", () => {
    const editor = createMockEditor();
    mockUseWikiLinkCandidates.mockReturnValue({
      pages: [{ id: "p-alpha", title: "Alpha", isDeleted: false }],
      isLoading: false,
    });
    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    // 入力が空のうちは候補ポップアップを開かない（フォーカス前と同じ挙動）。
    // While the input is empty, suggestions stay hidden — same as when the bar
    // has not been focused at all.
    expect(screen.queryByTestId("wiki-link-suggestion")).not.toBeInTheDocument();
  });

  it("入力したクエリで `useWikiLinkCandidates` の候補を絞り、サジェストを開く / opens the suggestion popup once the user types", async () => {
    const user = userEvent.setup();
    const editor = createMockEditor();
    mockUseWikiLinkCandidates.mockReturnValue({
      pages: [
        { id: "p-alpha", title: "Alpha", isDeleted: false },
        { id: "p-beta", title: "Beta", isDeleted: false },
      ],
      isLoading: false,
    });
    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    await user.type(screen.getByTestId("wiki-link-input-bar-input"), "Al");

    expect(screen.getByTestId("wiki-link-suggestion")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });
});

describe("WikiLinkInputBar - 確定挙動 / confirm behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWikiLinkCandidates.mockReturnValue({ pages: [], isLoading: false });
    mockUseWikiLinkExistsChecker.mockImplementation(() => ({
      checkExistence: mockCheckExistence,
    }));
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(),
      referencedTitles: new Set(),
      pageTitleToId: new Map(),
    });
    mockCheckReferenced.mockResolvedValue(false);
  });

  it("Enter で完全一致が無いときはゴーストリンクを退避位置に挿入する / Enter inserts a ghost wiki link at the saved cursor when no exact match", async () => {
    const user = userEvent.setup();
    const editor = createMockEditor({ selectionFrom: 12, selectionTo: 12 });
    mockCheckReferenced.mockResolvedValue(true);
    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    const input = screen.getByTestId("wiki-link-input-bar-input");
    await user.click(input);
    // クリック時点で editor.state.selection を退避していることを担保するため、
    // 入力中に editor.state.selection を変えてみる（フォーカス前位置で挿入される
    // ことを確認）。
    // Mutate `editor.state.selection` after focus to ensure the bar reuses the
    // saved position rather than reading current state at confirm time.
    (editor.state.selection as { from: number; to: number }).from = 999;
    (editor.state.selection as { from: number; to: number }).to = 999;
    await user.type(input, "New Topic");
    await user.keyboard("{Enter}");

    // `insertLink` は `void` で fire-and-forget するため、確定処理が次の
    // microtask で完了するのを `waitFor` で待つ。
    // The confirm path is fire-and-forget (`void insertLink(...)`), so we
    // need `waitFor` to flush the resolved promise before asserting.
    await waitFor(() => {
      expect(editor.chainReturn.insertContentAt).toHaveBeenCalled();
    });
    expect(mockCheckExistence).toHaveBeenCalledWith(["New Topic"], "p1");
    expect(mockCheckReferenced).toHaveBeenCalledWith("New Topic", "p1");
    expect(editor.chainReturn.insertContentAt).toHaveBeenCalledWith(12, [
      {
        type: "text",
        marks: [
          {
            type: "wikiLink",
            attrs: { title: "New Topic", exists: false, referenced: true, targetId: null },
          },
        ],
        text: "[[New Topic]]",
      },
    ]);
    expect(editor.chainReturn.run).toHaveBeenCalled();
  });

  it("Enter で入力が候補と完全一致したら既存ページリンクを挿入する / Enter falls back to the existing page link on exact match", async () => {
    const user = userEvent.setup();
    const editor = createMockEditor({ selectionFrom: 3, selectionTo: 3 });
    mockUseWikiLinkCandidates.mockReturnValue({
      pages: [{ id: "p-alpha", title: "Alpha", isDeleted: false }],
      isLoading: false,
    });
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(["alpha"]),
      referencedTitles: new Set(),
      pageTitleToId: new Map([["alpha", "p-alpha"]]),
    });

    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    const input = screen.getByTestId("wiki-link-input-bar-input");
    await user.click(input);
    await user.type(input, "Alpha");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(editor.chainReturn.insertContentAt).toHaveBeenCalled();
    });
    expect(editor.chainReturn.insertContentAt).toHaveBeenCalledWith(3, [
      {
        type: "text",
        marks: [
          {
            type: "wikiLink",
            attrs: { title: "Alpha", exists: true, referenced: false, targetId: "p-alpha" },
          },
        ],
        text: "[[Alpha]]",
      },
    ]);
    // ghost ではないので `checkReferenced` は呼ばれない。
    // No ghost branch → `checkReferenced` is not consulted.
    expect(mockCheckReferenced).not.toHaveBeenCalled();
  });

  it("候補クリックでも既存ページリンクを挿入し入力欄をクリアする / clicking a suggestion inserts the existing-page link and clears the input", async () => {
    const user = userEvent.setup();
    const editor = createMockEditor({ selectionFrom: 7, selectionTo: 7 });
    mockUseWikiLinkCandidates.mockReturnValue({
      pages: [{ id: "p-alpha", title: "Alpha", isDeleted: false }],
      isLoading: false,
    });
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(["alpha"]),
      referencedTitles: new Set(),
      pageTitleToId: new Map([["alpha", "p-alpha"]]),
    });

    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    const input = screen.getByTestId("wiki-link-input-bar-input") as HTMLInputElement;
    await user.click(input);
    await user.type(input, "Al");

    await user.click(screen.getByText("Alpha"));

    await waitFor(() => {
      expect(editor.chainReturn.insertContentAt).toHaveBeenCalled();
    });
    expect(editor.chainReturn.insertContentAt).toHaveBeenCalledWith(7, [
      {
        type: "text",
        marks: [
          {
            type: "wikiLink",
            attrs: { title: "Alpha", exists: true, referenced: false, targetId: "p-alpha" },
          },
        ],
        text: "[[Alpha]]",
      },
    ]);
    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("確定後にエディタへフォーカスを戻す / restores editor focus after confirming", async () => {
    const user = userEvent.setup();
    const editor = createMockEditor({ selectionFrom: 2, selectionTo: 2 });
    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    const input = screen.getByTestId("wiki-link-input-bar-input");
    await user.click(input);
    await user.type(input, "Topic");
    await user.keyboard("{Enter}");

    // 挿入チェーンの `focus()` で確実にエディタへ戻る。
    // The insertion chain's `focus()` ensures editor focus is restored.
    await waitFor(() => {
      expect(editor.chainReturn.focus).toHaveBeenCalled();
    });
  });
});

describe("WikiLinkInputBar - ガード / guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWikiLinkCandidates.mockReturnValue({ pages: [], isLoading: false });
    mockUseWikiLinkExistsChecker.mockImplementation(() => ({
      checkExistence: mockCheckExistence,
    }));
  });

  it("editor が null のときは何もしない / no-op when editor is null", async () => {
    const user = userEvent.setup();
    render(<WikiLinkInputBar editor={null} pageId="p1" pageNoteId={null} />);

    const input = screen.getByTestId("wiki-link-input-bar-input");
    await user.type(input, "Whatever");
    await user.keyboard("{Enter}");

    // editor が存在しないので外部依存は呼ばれない。
    // External dependencies are untouched without an editor.
    expect(mockCheckExistence).not.toHaveBeenCalled();
    expect(mockCheckReferenced).not.toHaveBeenCalled();
  });

  it("空白だけの入力では確定処理を行わない / does not confirm an all-whitespace input", async () => {
    const user = userEvent.setup();
    const editor = createMockEditor();
    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    const input = screen.getByTestId("wiki-link-input-bar-input");
    await user.click(input);
    await user.type(input, "   ");
    await user.keyboard("{Enter}");

    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("Escape で入力欄をクリアしエディタへフォーカスを戻す / Escape clears the bar and refocuses the editor", async () => {
    const user = userEvent.setup();
    const editor = createMockEditor();
    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    const input = screen.getByTestId("wiki-link-input-bar-input") as HTMLInputElement;
    await user.click(input);
    await user.type(input, "Stuff");
    await user.keyboard("{Escape}");

    expect(input.value).toBe("");
    expect(editor.commandsReturn.focus).toHaveBeenCalled();
  });
});

describe("WikiLinkInputBar - 外部フォーカス / external focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWikiLinkCandidates.mockReturnValue({ pages: [], isLoading: false });
    mockUseWikiLinkExistsChecker.mockImplementation(() => ({
      checkExistence: mockCheckExistence,
    }));
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(),
      referencedTitles: new Set(),
      pageTitleToId: new Map(),
    });
    mockCheckReferenced.mockResolvedValue(false);
  });

  it("`focusInputBarRef` 経由で input にフォーカスを移せる / lets the parent focus the input via `focusInputBarRef` (issue #928 / Cmd+K)", () => {
    const editor = createMockEditor();
    const focusInputBarRef: React.MutableRefObject<(() => void) | null> = { current: null };
    render(
      <WikiLinkInputBar
        editor={editor}
        pageId="p1"
        pageNoteId={null}
        focusInputBarRef={focusInputBarRef}
      />,
    );

    // マウント時点で割り当てられている。
    // The handle is wired on mount.
    expect(typeof focusInputBarRef.current).toBe("function");

    act(() => {
      focusInputBarRef.current?.();
    });

    const input = screen.getByTestId("wiki-link-input-bar-input");
    expect(document.activeElement).toBe(input);
  });

  it("unmount で ref が null に戻る / clears the ref on unmount to avoid dangling references", () => {
    const editor = createMockEditor();
    const focusInputBarRef: React.MutableRefObject<(() => void) | null> = { current: null };
    const { unmount } = render(
      <WikiLinkInputBar
        editor={editor}
        pageId="p1"
        pageNoteId={null}
        focusInputBarRef={focusInputBarRef}
      />,
    );

    expect(focusInputBarRef.current).not.toBeNull();
    unmount();
    expect(focusInputBarRef.current).toBeNull();
  });
});

describe("WikiLinkInputBar - スコープ転送 / scope forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWikiLinkExistsChecker.mockImplementation(() => ({
      checkExistence: mockCheckExistence,
    }));
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(),
      referencedTitles: new Set(),
      pageTitleToId: new Map(),
    });
    mockCheckReferenced.mockResolvedValue(false);
  });

  it("ノートスコープでは候補ページを `notePages` として exists checker に渡す / forwards note-scope candidates as `notePages` so the Enter fallback can resolve same-note pages (Codex P1, PR #934)", () => {
    const editor = createMockEditor();
    const notePages = [
      { id: "p-alpha", title: "Alpha", isDeleted: false },
      { id: "p-beta", title: "Beta", isDeleted: false },
    ];
    mockUseWikiLinkCandidates.mockReturnValue({ pages: notePages, isLoading: false });

    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId="note-1" />);

    // `useWikiLinkExistsChecker` がノートスコープで呼ばれるとき、候補ページを
    // `notePages` として渡していないと checker が空集合を返し、Enter による
    // 完全一致フォールバックが効かなくなる（同名既存ページがあってもゴーストを
    // 挿入してしまう）。
    // Without forwarding `notePages` in note scope the checker returns empty
    // sets and the Enter exact-match fallback silently inserts a ghost link
    // even when an existing same-note page matches.
    expect(mockUseWikiLinkExistsChecker).toHaveBeenCalledWith({
      pageNoteId: "note-1",
      notePages,
    });
  });

  it("個人スコープでは `notePages` を渡さず checker 既定の個人ページ取得に任せる / leaves `notePages` undefined for personal scope to keep the checker's `getPagesSummary` path", () => {
    const editor = createMockEditor();
    mockUseWikiLinkCandidates.mockReturnValue({
      pages: [{ id: "p-alpha", title: "Alpha", isDeleted: false }],
      isLoading: false,
    });

    render(<WikiLinkInputBar editor={editor} pageId="p1" pageNoteId={null} />);

    expect(mockUseWikiLinkExistsChecker).toHaveBeenCalledWith({
      pageNoteId: null,
      notePages: undefined,
    });
  });
});
