import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAIChatActions } from "./useAIChatActions";
import { createHookWrapper } from "@/test/testWrapper";

const mockToast = vi.fn();
const mockNavigate = vi.fn();
const mockCreatePageMutateAsync = vi.fn();
const mockUpdatePageMutateAsync = vi.fn();
const mockSyncLinks = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@zedi/ui", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/usePageQueries", () => ({
  useCreatePage: () => ({
    mutateAsync: mockCreatePageMutateAsync,
  }),
  useUpdatePage: () => ({
    mutateAsync: mockUpdatePageMutateAsync,
  }),
  useSyncWikiLinks: () => ({
    syncLinks: mockSyncLinks,
  }),
}));

describe("useAIChatActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePageMutateAsync.mockResolvedValue({ id: "new-page-id" });
    mockUpdatePageMutateAsync.mockResolvedValue(undefined);
    mockSyncLinks.mockResolvedValue(undefined);
  });

  it("returns handleExecuteAction", () => {
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createHookWrapper(),
    });
    expect(typeof result.current.handleExecuteAction).toBe("function");
  });

  it("create-page action calls createPageMutation.mutateAsync and navigate", async () => {
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createHookWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "create-page",
        title: "New Page",
        content: "Content",
        suggestedLinks: [],
        reason: "test",
      });
    });

    expect(mockCreatePageMutateAsync).toHaveBeenCalledWith({
      title: "New Page",
      content: "Content",
    });
    expect(mockNavigate).toHaveBeenCalledWith("/page/new-page-id");
  });

  it("append-to-page without pageContext shows pageContextRequired toast", async () => {
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createHookWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "append-to-page",
        pageTitle: "Any",
        content: "Append",
        reason: "test",
      });
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.notifications.pageContextRequired",
      variant: "destructive",
    });
    expect(mockUpdatePageMutateAsync).not.toHaveBeenCalled();
  });

  it("suggest-wiki-links without pageContext shows pageContextRequired toast", async () => {
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createHookWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "suggest-wiki-links",
        links: [{ keyword: "K", existingPageTitle: "P" }],
        reason: "test",
      });
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.notifications.pageContextRequired",
      variant: "destructive",
    });
    expect(mockUpdatePageMutateAsync).not.toHaveBeenCalled();
  });
});
