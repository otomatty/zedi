import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { usePageEditorEffects } from "./usePageEditorEffects";
import { AIChatProvider } from "@/contexts/AIChatContext";
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

describe("usePageEditorEffects", () => {
  const mockNavigate = vi.fn();
  const mockToast = vi.fn();
  const mockSetContent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates to /home when isNewPage is true", () => {
    renderHook(
      () =>
        usePageEditorEffects({
          isNewPage: true,
          currentPageId: null,
          isInitialized: false,
          isError: false,
          page: null,
          title: "",
          content: "",
          isWikiGenerating: false,
          wikiStatus: "idle",
          throttledTiptapContent: null,
          navigate: mockNavigate,
          location: { pathname: "/page/new", state: null } as ReturnType<
            (typeof import("react-router-dom"))["useLocation"]
          >,
          initialize: vi.fn(),
          setContent: mockSetContent,
          setWikiContentForCollab: vi.fn(),
          setSourceUrl: vi.fn(),
          setPendingInitialContent: vi.fn(),
          getTiptapContent: () => null,
          saveChanges: vi.fn(),
          resetWiki: vi.fn(),
          updatePageMutation: { mutate: vi.fn(), mutateAsync: vi.fn() } as never,
          toast: mockToast,
        }),
      { wrapper },
    );

    expect(mockNavigate).toHaveBeenCalledWith("/home", { replace: true });
  });

  it("calls initialize when page is set and not yet initialized", () => {
    const initialize = vi.fn();
    const page = createMockPage();

    renderHook(
      () =>
        usePageEditorEffects({
          isNewPage: false,
          currentPageId: "page-1",
          isInitialized: false,
          isError: false,
          page,
          title: "Test",
          content: "",
          isWikiGenerating: false,
          wikiStatus: "idle",
          throttledTiptapContent: null,
          navigate: mockNavigate,
          location: { pathname: "/page/1", state: null } as ReturnType<
            (typeof import("react-router-dom"))["useLocation"]
          >,
          initialize,
          setContent: mockSetContent,
          setWikiContentForCollab: vi.fn(),
          setSourceUrl: vi.fn(),
          setPendingInitialContent: vi.fn(),
          getTiptapContent: () => null,
          saveChanges: vi.fn(),
          resetWiki: vi.fn(),
          updatePageMutation: { mutate: vi.fn(), mutateAsync: vi.fn() } as never,
          toast: mockToast,
        }),
      { wrapper },
    );

    expect(initialize).toHaveBeenCalledWith(page);
  });
});
