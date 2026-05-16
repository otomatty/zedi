/* eslint-disable max-lines-per-function -- Shared mocks; behavior is grouped in nested describe blocks. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { usePageEditorEffects, type UsePageEditorEffectsOptions } from "./usePageEditorEffects";
import { AIChatProvider, useAIChatContext } from "@/contexts/AIChatContext";
import type { Page } from "@/types/page";

const createMockPage = (overrides: Partial<Page> = {}): Page =>
  ({
    id: "page-1",
    title: "Test Page",
    content: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    }),
    ownerUserId: "user-1",
    noteId: null,
    createdAt: "",
    updatedAt: "",
    isDeleted: false,
    ...overrides,
  }) as Page;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AIChatProvider>{children}</AIChatProvider>;
}

/** Minimal `location` shape used by the hook (pathname + state). */
function mockLocation(
  pathname: string,
  state: UsePageEditorEffectsOptions["location"]["state"],
): UsePageEditorEffectsOptions["location"] {
  return { pathname, state } as UsePageEditorEffectsOptions["location"];
}

/**
 * Returns whether `navigate` was invoked with `path` as the first argument (any number of args).
 * `navigate` の第1引数が `path` か（引数の個数は問わない）。
 */
function wasNavigateCalledWithPath(
  navigate: { mock: { calls: unknown[][] } },
  path: string,
): boolean {
  return navigate.mock.calls.some((c) => c[0] === path);
}

function createBaseOptions(
  overrides: Partial<UsePageEditorEffectsOptions> = {},
): UsePageEditorEffectsOptions {
  return {
    isNewPage: false,
    currentPageId: "page-1",
    isInitialized: true,
    isError: false,
    page: createMockPage(),
    title: "Test",
    content: "",
    isWikiGenerating: false,
    wikiStatus: "idle",
    throttledTiptapContent: null,
    navigate: vi.fn(),
    location: mockLocation("/pages/page-1", null),
    initialize: vi.fn(),
    setContent: vi.fn(),
    setWikiContentForCollab: vi.fn(),
    setSourceUrl: vi.fn(),
    setPendingInitialContent: vi.fn(),
    getTiptapContent: () => null,
    saveChanges: vi.fn(),
    resetWikiBase: vi.fn(),
    updatePageMutation: { mutate: vi.fn(), mutateAsync: vi.fn() } as never,
    toast: vi.fn(),
    ...overrides,
  };
}

describe("usePageEditorEffects", () => {
  const mockNavigate = vi.fn();
  const mockToast = vi.fn();
  const mockSetContent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("navigation and initialization", () => {
    it("navigates to /notes/me when isNewPage is true", () => {
      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isNewPage: true,
              currentPageId: null,
              isInitialized: false,
              page: null,
              title: "",
              navigate: mockNavigate,
              location: mockLocation("/pages/new", null),
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(mockNavigate).toHaveBeenCalledWith("/notes/me", { replace: true });
    });

    it("does not redirect to /notes/me when isNewPage is false", () => {
      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isNewPage: false,
              navigate: mockNavigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(wasNavigateCalledWithPath(mockNavigate, "/notes/me")).toBe(false);
    });

    it("calls initialize when page is set and not yet initialized", () => {
      const initialize = vi.fn();
      const page = createMockPage();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isInitialized: false,
              page,
              title: "Test",
              location: mockLocation("/pages/1", null),
              initialize,
              navigate: mockNavigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(initialize).toHaveBeenCalledWith(page);
    });

    it("does not initialize when already initialized", () => {
      const initialize = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isInitialized: true,
              page: createMockPage(),
              initialize,
              navigate: mockNavigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(initialize).not.toHaveBeenCalled();
    });

    it("does not initialize when page is still null", () => {
      const initialize = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isNewPage: false,
              isInitialized: false,
              page: null,
              initialize,
              navigate: mockNavigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(initialize).not.toHaveBeenCalled();
    });

    it("initializes after page data becomes available (dependency update)", () => {
      const initialize = vi.fn();
      const page = createMockPage();

      const { rerender } = renderHook(
        (props: { page: Page | null }) =>
          usePageEditorEffects(
            createBaseOptions({
              isNewPage: false,
              isInitialized: false,
              page: props.page,
              initialize,
              navigate: mockNavigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper, initialProps: { page: null as Page | null } },
      );

      expect(initialize).not.toHaveBeenCalled();

      rerender({ page });

      expect(initialize).toHaveBeenCalledTimes(1);
      expect(initialize).toHaveBeenCalledWith(page);
    });

    it("redirects to /notes/me when isNewPage flips to true after mount", () => {
      const { rerender } = renderHook(
        (props: { isNewPage: boolean }) =>
          usePageEditorEffects(
            createBaseOptions({
              isNewPage: props.isNewPage,
              navigate: mockNavigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper, initialProps: { isNewPage: false } },
      );

      expect(wasNavigateCalledWithPath(mockNavigate, "/notes/me")).toBe(false);

      rerender({ isNewPage: true });

      expect(mockNavigate).toHaveBeenCalledWith("/notes/me", { replace: true });
    });
  });

  describe("location.state (create from URL)", () => {
    it("applies initialContent from location.state and clears router state", () => {
      const setPendingInitialContent = vi.fn();
      const navigate = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              currentPageId: "page-1",
              isInitialized: true,
              location: mockLocation("/pages/page-1", { initialContent: "<p>from-url</p>" }),
              setPendingInitialContent,
              navigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(setPendingInitialContent).toHaveBeenCalledWith("<p>from-url</p>");
      expect(navigate).toHaveBeenCalledWith("/pages/page-1", { replace: true, state: null });
    });

    it("does not apply location.state when not initialized", () => {
      const setPendingInitialContent = vi.fn();
      const navigate = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isInitialized: false,
              location: mockLocation("/pages/page-1", { initialContent: "x" }),
              setPendingInitialContent,
              navigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(setPendingInitialContent).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("does not apply location.state when currentPageId is missing", () => {
      const setPendingInitialContent = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              currentPageId: null,
              isInitialized: true,
              location: mockLocation("/pages/new", { initialContent: "x" }),
              setPendingInitialContent,
              navigate: mockNavigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(setPendingInitialContent).not.toHaveBeenCalled();
    });

    it("persists sourceUrl and thumbnailUrl from location.state via updatePageMutation", () => {
      const setSourceUrl = vi.fn();
      const mutate = vi.fn();
      const navigate = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isInitialized: true,
              location: mockLocation("/pages/page-1", {
                sourceUrl: "https://example.com",
                thumbnailUrl: "https://cdn.example.com/t.png",
              }),
              setSourceUrl,
              navigate,
              updatePageMutation: { mutate, mutateAsync: vi.fn() } as never,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(setSourceUrl).toHaveBeenCalledWith("https://example.com");
      expect(mutate).toHaveBeenCalledWith({
        pageId: "page-1",
        updates: {
          sourceUrl: "https://example.com",
          thumbnailUrl: "https://cdn.example.com/t.png",
        },
      });
      expect(navigate).toHaveBeenCalledWith("/pages/page-1", { replace: true, state: null });
    });

    it("handles thumbnail-only state with empty sourceUrl passed to setSourceUrl", () => {
      const setSourceUrl = vi.fn();
      const mutate = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isInitialized: true,
              location: mockLocation("/pages/page-1", { thumbnailUrl: "https://img/t.png" }),
              setSourceUrl,
              navigate: mockNavigate,
              updatePageMutation: { mutate, mutateAsync: vi.fn() } as never,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(setSourceUrl).toHaveBeenCalledWith("");
      expect(mutate).toHaveBeenCalledWith({
        pageId: "page-1",
        updates: {
          sourceUrl: undefined,
          thumbnailUrl: "https://img/t.png",
        },
      });
    });

    it("does not persist when location.state has no initialContent or media fields", () => {
      const setSourceUrl = vi.fn();
      const mutate = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isInitialized: true,
              location: mockLocation("/pages/page-1", {}),
              setSourceUrl,
              navigate: mockNavigate,
              updatePageMutation: { mutate, mutateAsync: vi.fn() } as never,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(setSourceUrl).not.toHaveBeenCalled();
      expect(mutate).not.toHaveBeenCalled();
    });

    it("applies initialContent when location.state becomes available after mount (dependency update)", () => {
      const setPendingInitialContent = vi.fn();
      const navigate = vi.fn();

      const { rerender } = renderHook(
        (props: { loc: UsePageEditorEffectsOptions["location"] }) =>
          usePageEditorEffects(
            createBaseOptions({
              currentPageId: "page-1",
              isInitialized: true,
              location: props.loc,
              setPendingInitialContent,
              navigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        {
          wrapper,
          initialProps: { loc: mockLocation("/pages/page-1", null) },
        },
      );

      expect(setPendingInitialContent).not.toHaveBeenCalled();

      rerender({
        loc: mockLocation("/pages/page-1", { initialContent: "<p>deferred</p>" }),
      });

      expect(setPendingInitialContent).toHaveBeenCalledWith("<p>deferred</p>");
      expect(navigate).toHaveBeenCalledWith("/pages/page-1", { replace: true, state: null });
    });
  });

  describe("load errors", () => {
    it("navigates home and toasts when page load errors", () => {
      const navigate = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isNewPage: false,
              isError: true,
              navigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(navigate).toHaveBeenCalledWith("/");
      expect(mockToast).toHaveBeenCalledWith({
        title: "ページが見つかりません",
        variant: "destructive",
      });
    });

    it("does not treat load error as not-found when creating a new page", () => {
      const navigate = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isNewPage: true,
              isError: true,
              navigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper },
      );

      expect(wasNavigateCalledWithPath(navigate, "/")).toBe(false);
      expect(mockToast).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "ページが見つかりません" }),
      );
    });

    it("navigates away when isError becomes true after load (dependency update)", () => {
      const navigate = vi.fn();

      const { rerender } = renderHook(
        (props: { isError: boolean }) =>
          usePageEditorEffects(
            createBaseOptions({
              isError: props.isError,
              navigate,
              setContent: mockSetContent,
              toast: mockToast,
            }),
          ),
        { wrapper, initialProps: { isError: false } },
      );

      expect(wasNavigateCalledWithPath(navigate, "/")).toBe(false);

      rerender({ isError: true });

      expect(navigate).toHaveBeenCalledWith("/");
      expect(mockToast).toHaveBeenCalledWith({
        title: "ページが見つかりません",
        variant: "destructive",
      });
    });
  });

  describe("wiki generation stream", () => {
    it("mirrors throttled wiki stream into editor and collab when wiki is generating", () => {
      const setWikiContentForCollab = vi.fn();
      const html = "<p>stream</p>";

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isWikiGenerating: true,
              throttledTiptapContent: html,
              setContent: mockSetContent,
              setWikiContentForCollab,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          ),
        { wrapper },
      );

      expect(mockSetContent).toHaveBeenCalledWith(html);
      expect(setWikiContentForCollab).toHaveBeenCalledWith(html);
    });

    it("does not mirror wiki stream when throttled content is empty", () => {
      const setWikiContentForCollab = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              isWikiGenerating: true,
              throttledTiptapContent: null,
              setContent: mockSetContent,
              setWikiContentForCollab,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          ),
        { wrapper },
      );

      expect(mockSetContent).not.toHaveBeenCalled();
      expect(setWikiContentForCollab).not.toHaveBeenCalled();
    });

    it("starts mirroring when generation and throttled content turn on (dependency update)", () => {
      const setWikiContentForCollab = vi.fn();
      const html = "<p>later</p>";

      const { rerender } = renderHook(
        (props: { gen: boolean; throttle: string | null }) =>
          usePageEditorEffects(
            createBaseOptions({
              isWikiGenerating: props.gen,
              throttledTiptapContent: props.throttle,
              setContent: mockSetContent,
              setWikiContentForCollab,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          ),
        { wrapper, initialProps: { gen: false, throttle: null as string | null } },
      );

      expect(mockSetContent).not.toHaveBeenCalledWith(html);

      rerender({ gen: true, throttle: html });

      expect(mockSetContent).toHaveBeenCalledWith(html);
      expect(setWikiContentForCollab).toHaveBeenCalledWith(html);
    });
  });

  describe("wiki completion", () => {
    it("does not run completion pipeline while wikiStatus is idle", () => {
      const resetWikiBase = vi.fn();
      const saveChanges = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              wikiStatus: "idle",
              getTiptapContent: () => "should-not-run",
              resetWikiBase,
              saveChanges,
              setContent: mockSetContent,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          ),
        { wrapper },
      );

      expect(resetWikiBase).not.toHaveBeenCalled();
      expect(saveChanges).not.toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalledWith({ title: "Wiki記事を生成しました" });
    });

    it("runs completion when wikiStatus becomes completed (dependency update)", () => {
      const saveChanges = vi.fn();
      const resetWikiBase = vi.fn();
      const setWikiContentForCollab = vi.fn();
      const body = '{"type":"doc","content":[]}';

      const { rerender } = renderHook(
        (props: { status: string }) =>
          usePageEditorEffects(
            createBaseOptions({
              wikiStatus: props.status,
              title: "T",
              getTiptapContent: () => body,
              saveChanges,
              resetWikiBase,
              setContent: mockSetContent,
              setWikiContentForCollab,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          ),
        { wrapper, initialProps: { status: "idle" } },
      );

      expect(resetWikiBase).not.toHaveBeenCalled();

      rerender({ status: "completed" });

      expect(mockSetContent).toHaveBeenCalledWith(body);
      expect(saveChanges).toHaveBeenCalledWith("T", body);
      expect(resetWikiBase).toHaveBeenCalled();
    });

    it("on wiki completed with content: saves, toasts, updates collab, and resets wiki base", () => {
      const saveChanges = vi.fn();
      const resetWikiBase = vi.fn();
      const setWikiContentForCollab = vi.fn();
      const body = '{"type":"doc","content":[]}';

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              wikiStatus: "completed",
              title: "Wiki Title",
              getTiptapContent: () => body,
              saveChanges,
              resetWikiBase,
              setContent: mockSetContent,
              setWikiContentForCollab,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          ),
        { wrapper },
      );

      expect(mockSetContent).toHaveBeenCalledWith(body);
      expect(setWikiContentForCollab).toHaveBeenCalledWith(body);
      expect(saveChanges).toHaveBeenCalledWith("Wiki Title", body);
      expect(mockToast).toHaveBeenCalledWith({ title: "Wiki記事を生成しました" });
      expect(resetWikiBase).toHaveBeenCalled();
    });

    it("on wiki completed with empty editor: skips save but still resets wiki base", () => {
      const saveChanges = vi.fn();
      const resetWikiBase = vi.fn();

      renderHook(
        () =>
          usePageEditorEffects(
            createBaseOptions({
              wikiStatus: "completed",
              getTiptapContent: () => "",
              saveChanges,
              resetWikiBase,
              setContent: mockSetContent,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          ),
        { wrapper },
      );

      expect(saveChanges).not.toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalledWith({ title: "Wiki記事を生成しました" });
      expect(resetWikiBase).toHaveBeenCalled();
    });
  });

  describe("AI chat context and append handler", () => {
    it("sets AI page context with truncated preview and full content", () => {
      const long = "a".repeat(4000);

      const { result } = renderHook(
        () => {
          usePageEditorEffects(
            createBaseOptions({
              title: "My title",
              currentPageId: "pid-9",
              content: long,
              setContent: mockSetContent,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          );
          return useAIChatContext();
        },
        { wrapper },
      );

      expect(result.current.pageContext).toEqual({
        type: "editor",
        pageId: "pid-9",
        pageTitle: "My title",
        pageContent: long.substring(0, 3000),
        pageFullContent: long,
      });
    });

    it("sets AI page context when only title is set (no page id)", () => {
      const { result } = renderHook(
        () => {
          usePageEditorEffects(
            createBaseOptions({
              title: "Title only",
              currentPageId: null,
              content: "c",
              setContent: mockSetContent,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          );
          return useAIChatContext();
        },
        { wrapper },
      );

      expect(result.current.pageContext).toEqual({
        type: "editor",
        pageId: undefined,
        pageTitle: "Title only",
        pageContent: "c".substring(0, 3000),
        pageFullContent: "c",
      });
    });

    it("sets AI page context when only currentPageId is set (empty title)", () => {
      const { result } = renderHook(
        () => {
          usePageEditorEffects(
            createBaseOptions({
              title: "",
              currentPageId: "only-id",
              content: "",
              setContent: mockSetContent,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          );
          return useAIChatContext();
        },
        { wrapper },
      );

      expect(result.current.pageContext).toEqual({
        type: "editor",
        pageId: "only-id",
        pageTitle: "",
        pageContent: undefined,
        pageFullContent: undefined,
      });
    });

    it("clears page context when title and page id become empty", () => {
      const { result, rerender } = renderHook(
        (props: { title: string; pageId: string | null; content: string }) => {
          usePageEditorEffects(
            createBaseOptions({
              title: props.title,
              currentPageId: props.pageId,
              content: props.content,
              setContent: mockSetContent,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          );
          return useAIChatContext();
        },
        {
          wrapper,
          initialProps: { title: "T", pageId: "p1", content: "body" },
        },
      );

      expect(result.current.pageContext).toMatchObject({
        type: "editor",
        pageId: "p1",
        pageTitle: "T",
      });

      rerender({ title: "", pageId: null, content: "" });

      expect(result.current.pageContext).toBeNull();
    });

    it("registers setContent on contentAppendHandlerRef while page id is set and clears on unmount", () => {
      const setContentFn = vi.fn();
      const { result, unmount } = renderHook(
        () => {
          usePageEditorEffects(
            createBaseOptions({
              currentPageId: "page-1",
              setContent: setContentFn,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          );
          return useAIChatContext().contentAppendHandlerRef;
        },
        { wrapper },
      );

      expect(result.current.current).toBe(setContentFn);

      unmount();

      expect(result.current.current).toBeNull();
    });

    it("does not assign append handler when currentPageId is null", () => {
      const { result } = renderHook(
        () => {
          usePageEditorEffects(
            createBaseOptions({
              currentPageId: null,
              setContent: mockSetContent,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          );
          return useAIChatContext().contentAppendHandlerRef;
        },
        { wrapper },
      );

      expect(result.current.current).toBeNull();
    });

    it("registers append handler when currentPageId becomes non-null (dependency update)", () => {
      const setContentFn = vi.fn();

      const { result, rerender } = renderHook(
        (props: { pageId: string | null }) => {
          usePageEditorEffects(
            createBaseOptions({
              currentPageId: props.pageId,
              setContent: setContentFn,
              toast: mockToast,
              navigate: mockNavigate,
            }),
          );
          return useAIChatContext().contentAppendHandlerRef;
        },
        { wrapper, initialProps: { pageId: null as string | null } },
      );

      expect(result.current.current).toBeNull();

      rerender({ pageId: "page-1" });

      expect(result.current.current).toBe(setContentFn);
    });
  });
});
