import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSuggestionEffects } from "./useSuggestionEffects";
import type { Editor } from "@tiptap/core";
import { wikiLinkSuggestionPluginKey } from "../extensions/wikiLinkSuggestionPlugin";
import { slashSuggestionPluginKey } from "../extensions/slashSuggestionPlugin";
import { tagSuggestionPluginKey } from "../extensions/tagSuggestionPlugin";

const mockCheckReferenced = vi.fn();
vi.mock("@/hooks/usePageQueries", () => ({
  useCheckGhostLinkReferenced: () => ({ checkReferenced: mockCheckReferenced }),
}));

function createMockEditor(): Editor & {
  chainRun: ReturnType<typeof vi.fn>;
  dispatchSpy: ReturnType<typeof vi.fn>;
} {
  const chainRun = vi.fn();
  const dispatchSpy = vi.fn();
  const mockTr = {};
  const setMeta = vi.fn().mockReturnValue(mockTr);

  const editor = {
    chain: vi.fn(() => ({
      focus: vi.fn().mockReturnThis(),
      deleteRange: vi.fn().mockReturnThis(),
      insertContent: vi.fn().mockReturnThis(),
      run: chainRun,
    })),
    view: {
      dispatch: dispatchSpy,
      state: { tr: { setMeta } },
      coordsAtPos: vi.fn().mockReturnValue({ top: 0, left: 0, bottom: 10, right: 50 }),
    },
  } as unknown as Editor & { chainRun: typeof chainRun; dispatchSpy: typeof dispatchSpy };

  (editor as { chainRun: typeof chainRun }).chainRun = chainRun;
  (editor as { dispatchSpy: typeof dispatchSpy }).dispatchSpy = dispatchSpy;
  return editor as Editor & { chainRun: typeof chainRun; dispatchSpy: typeof dispatchSpy };
}

const editorContainerRef = { current: document.createElement("div") };

describe("useSuggestionEffects", () => {
  const defaultOptions = {
    editor: null as Editor | null,
    suggestionState: null as { active: boolean; range: { from: number; to: number } | null } | null,
    slashState: null as { active: boolean; range: { from: number; to: number } | null } | null,
    tagSuggestionState: null as {
      active: boolean;
      range: { from: number; to: number } | null;
    } | null,
    editorContainerRef,
    pageId: "page-1",
    handleInsertImageClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleSuggestionSelect does nothing when editor is null", async () => {
    const { result } = renderHook(() =>
      useSuggestionEffects({
        ...defaultOptions,
        suggestionState: { active: true, range: { from: 0, to: 5 } },
      }),
    );

    await act(async () => {
      await result.current.handleSuggestionSelect({
        id: "1",
        title: "Foo",
        exists: false,
      });
    });

    expect(mockCheckReferenced).not.toHaveBeenCalled();
  });

  it("handleSuggestionSelect calls checkReferenced and editor chain when editor and range exist", async () => {
    mockCheckReferenced.mockResolvedValue(false);
    const mockEditor = createMockEditor();

    const { result } = renderHook(() =>
      useSuggestionEffects({
        ...defaultOptions,
        editor: mockEditor,
        suggestionState: { active: true, range: { from: 0, to: 5 } },
      }),
    );

    await act(async () => {
      await result.current.handleSuggestionSelect({
        id: "1",
        title: "New Page",
        exists: false,
      });
    });

    expect(mockCheckReferenced).toHaveBeenCalledWith("New Page", "page-1");
    expect(mockEditor.chain).toHaveBeenCalled();
    expect(mockEditor.chainRun).toHaveBeenCalled();
    expect(mockEditor.view.state.tr.setMeta).toHaveBeenCalledWith(wikiLinkSuggestionPluginKey, {
      close: true,
    });
    expect(mockEditor.dispatchSpy).toHaveBeenCalled();
  });

  it("handleSuggestionSelect does not call checkReferenced when item.exists is true", async () => {
    const mockEditor = createMockEditor();

    const { result } = renderHook(() =>
      useSuggestionEffects({
        ...defaultOptions,
        editor: mockEditor,
        suggestionState: { active: true, range: { from: 0, to: 5 } },
      }),
    );

    await act(async () => {
      await result.current.handleSuggestionSelect({
        id: "1",
        title: "Existing",
        exists: true,
      });
    });

    expect(mockCheckReferenced).not.toHaveBeenCalled();
    expect(mockEditor.chainRun).toHaveBeenCalled();
  });

  it("handleSuggestionClose does nothing when editor is null", () => {
    const { result } = renderHook(() => useSuggestionEffects(defaultOptions));

    act(() => {
      result.current.handleSuggestionClose();
    });

    expect(defaultOptions.handleInsertImageClick).not.toHaveBeenCalled();
  });

  it("handleSuggestionClose dispatches with wikiLinkSuggestionPluginKey when editor exists", () => {
    const mockEditor = createMockEditor();
    const { result } = renderHook(() =>
      useSuggestionEffects({ ...defaultOptions, editor: mockEditor }),
    );

    act(() => {
      result.current.handleSuggestionClose();
    });

    expect(mockEditor.view.state.tr.setMeta).toHaveBeenCalledWith(wikiLinkSuggestionPluginKey, {
      close: true,
    });
    expect(mockEditor.dispatchSpy).toHaveBeenCalled();
  });

  it("handleSlashClose dispatches with slashSuggestionPluginKey when editor exists", () => {
    const mockEditor = createMockEditor();
    const { result } = renderHook(() =>
      useSuggestionEffects({ ...defaultOptions, editor: mockEditor }),
    );

    act(() => {
      result.current.handleSlashClose();
    });

    expect(mockEditor.view.state.tr.setMeta).toHaveBeenCalledWith(slashSuggestionPluginKey, {
      close: true,
    });
    expect(mockEditor.dispatchSpy).toHaveBeenCalled();
  });

  it("dispatches slash-command-insert-image event calls handleInsertImageClick", () => {
    const handleInsertImageClick = vi.fn();
    renderHook(() =>
      useSuggestionEffects({
        ...defaultOptions,
        handleInsertImageClick,
      }),
    );

    act(() => {
      window.dispatchEvent(new CustomEvent("slash-command-insert-image"));
    });

    expect(handleInsertImageClick).toHaveBeenCalledTimes(1);
  });

  // --- Tag suggestion (issue #767, Phase 2) ---
  // タグサジェストの確定 / クローズ動線が WikiLink と同じ契約で動くことを固定。
  // Pin the tag suggestion confirm / close path against the same shape as
  // WikiLink so both popovers stay behavior-equivalent.

  it("handleTagSuggestionSelect inserts a tag mark via the editor chain (issue #767)", async () => {
    const mockEditor = createMockEditor();
    mockCheckReferenced.mockResolvedValue(false);

    const { result } = renderHook(() =>
      useSuggestionEffects({
        ...defaultOptions,
        editor: mockEditor,
        tagSuggestionState: { active: true, range: { from: 1, to: 5 } },
      }),
    );

    await act(async () => {
      await result.current.handleTagSuggestionSelect({
        name: "tech",
        exists: true,
        targetId: "page-uuid-1",
      });
    });

    // 既存ページなので referenced の確認はスキップされる（exists=true）。
    // exists=true → no ghost-link probe.
    expect(mockCheckReferenced).not.toHaveBeenCalled();
    expect(mockEditor.chain).toHaveBeenCalled();
    expect(mockEditor.chainRun).toHaveBeenCalled();
    // 確定後はサジェストプラグインに close メタを流して閉じる。
    // Confirms always close the popover via the plugin's `close` meta.
    expect(mockEditor.view.state.tr.setMeta).toHaveBeenCalledWith(tagSuggestionPluginKey, {
      close: true,
    });
    expect(mockEditor.dispatchSpy).toHaveBeenCalled();
  });

  it("handleTagSuggestionSelect probes ghost references when item.exists is false", async () => {
    // 既存ページが無いタグでは ghost_links を見て他ページでの利用有無を判定し
    // `referenced` 属性に反映する（WikiLink と同じ規則）。
    // Ghost tags need the referenced check so the mark renders the
    // `referenced` style consistently with WikiLink ghosts.
    mockCheckReferenced.mockResolvedValue(true);
    const mockEditor = createMockEditor();

    const { result } = renderHook(() =>
      useSuggestionEffects({
        ...defaultOptions,
        editor: mockEditor,
        tagSuggestionState: { active: true, range: { from: 1, to: 5 } },
      }),
    );

    await act(async () => {
      await result.current.handleTagSuggestionSelect({
        name: "newtag",
        exists: false,
        targetId: null,
      });
    });

    expect(mockCheckReferenced).toHaveBeenCalledWith("newtag", "page-1");
    expect(mockEditor.chainRun).toHaveBeenCalled();
  });

  it("handleTagSuggestionSelect does nothing when editor is null", async () => {
    const { result } = renderHook(() =>
      useSuggestionEffects({
        ...defaultOptions,
        tagSuggestionState: { active: true, range: { from: 0, to: 5 } },
      }),
    );

    await act(async () => {
      await result.current.handleTagSuggestionSelect({
        name: "tech",
        exists: false,
        targetId: null,
      });
    });

    expect(mockCheckReferenced).not.toHaveBeenCalled();
  });

  it("handleTagSuggestionClose dispatches with tagSuggestionPluginKey when editor exists", () => {
    const mockEditor = createMockEditor();
    const { result } = renderHook(() =>
      useSuggestionEffects({ ...defaultOptions, editor: mockEditor }),
    );

    act(() => {
      result.current.handleTagSuggestionClose();
    });

    expect(mockEditor.view.state.tr.setMeta).toHaveBeenCalledWith(tagSuggestionPluginKey, {
      close: true,
    });
    expect(mockEditor.dispatchSpy).toHaveBeenCalled();
  });
});
