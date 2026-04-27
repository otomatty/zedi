import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAIChatActions } from "./useAIChatActions";
import { AIChatProvider, useAIChatContext } from "@/contexts/AIChatContext";
import { createHookWrapper } from "@/test/testWrapper";
import { appendMarkdownToTiptapContent } from "@/lib/aiChatActionHelpers";

const mockToast = vi.fn();
const mockNavigate = vi.fn();
const mockCreatePageMutateAsync = vi.fn();
const mockUpdatePageMutateAsync = vi.fn();
const mockSyncLinks = vi.fn();
const mockContentAppendHandler = vi.fn();

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

const createWrapper = () => {
  const Base = createHookWrapper();

  function AppendHandlerRegistrar() {
    const { contentAppendHandlerRef } = useAIChatContext();
    React.useEffect(() => {
      contentAppendHandlerRef.current = mockContentAppendHandler;
      return () => {
        contentAppendHandlerRef.current = null;
      };
    }, [contentAppendHandlerRef]);
    return null;
  }

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      Base,
      null,
      React.createElement(
        AIChatProvider,
        null,
        React.createElement(
          React.Fragment,
          null,
          React.createElement(AppendHandlerRegistrar),
          children,
        ),
      ),
    );
  };
};

describe("useAIChatActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePageMutateAsync.mockResolvedValue({ id: "new-page-id" });
    mockUpdatePageMutateAsync.mockResolvedValue(undefined);
    mockSyncLinks.mockResolvedValue(undefined);
  });

  it("returns handleExecuteAction", () => {
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.handleExecuteAction).toBe("function");
  });

  it("create-page action calls createPageMutation.mutateAsync and navigate", async () => {
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createWrapper(),
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
    expect(mockNavigate).toHaveBeenCalledWith("/pages/new-page-id");
  });

  it("append-to-page without pageContext shows pageContextRequired toast", async () => {
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createWrapper(),
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
      wrapper: createWrapper(),
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

  it("append-to-page updates the page, syncs links, and notifies the editor", async () => {
    const pageContext = {
      type: "editor" as const,
      pageId: "page-1",
      pageTitle: "Current Page",
      pageFullContent: "",
    };
    const { result } = renderHook(() => useAIChatActions({ pageContext }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "append-to-page",
        pageTitle: "Current Page",
        content: "Append body",
        reason: "test",
      });
    });

    // `dropLeadingH1: true` is passed in the production code (issue #784); content with no
    // leading `# X` is unaffected, so the expected document matches both sides.
    // 本番コードでは `dropLeadingH1: true` を渡している（issue #784）。先頭に `# X` が
    // 無い入力なら有り無しで結果は同じ。
    const expectedContent = appendMarkdownToTiptapContent("", "Append body", {
      dropLeadingH1: true,
    });
    expect(mockUpdatePageMutateAsync).toHaveBeenCalledWith({
      pageId: "page-1",
      updates: { content: expectedContent },
    });
    expect(mockSyncLinks).toHaveBeenCalledWith("page-1", []);
    expect(mockContentAppendHandler).toHaveBeenCalledWith(expectedContent);
    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.notifications.appendSuccess",
    });
  });

  // issue #784: AI が `# Title\n## Section\n本文` のように先頭 H1 を出した場合でも、
  // 本文に `# Title` が literal paragraph として残らない（`dropLeadingH1: true` が
  // 経路に確実に伝わっていることの回帰テスト）。
  // issue #784: when the AI emits a leading `# Title`, it must NOT survive in the body as a
  // literal paragraph. This is a regression test that the AI append path threads
  // `dropLeadingH1: true` through to the converter.
  it("append-to-page strips a leading `# Title` line from AI markdown (issue #784)", async () => {
    const pageContext = {
      type: "editor" as const,
      pageId: "page-1",
      pageTitle: "Current Page",
      pageFullContent: "",
    };
    const { result } = renderHook(() => useAIChatActions({ pageContext }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "append-to-page",
        pageTitle: "Current Page",
        content: "# Title\n## Section\n本文",
        reason: "test",
      });
    });

    expect(mockUpdatePageMutateAsync).toHaveBeenCalledTimes(1);
    const call = mockUpdatePageMutateAsync.mock.calls[0]?.[0] as {
      pageId: string;
      updates: { content: string };
    };
    const updatedDoc = JSON.parse(call.updates.content) as {
      content: Array<{ type: string; content?: Array<{ text?: string }> }>;
    };

    // `# Title` 行が本文に literal paragraph として残らない。
    // The `# Title` line does not survive as a literal paragraph in the body.
    const literalH1 = updatedDoc.content.find((node) => {
      if (node.type !== "paragraph") return false;
      return node.content?.some((inline) => inline.text === "# Title");
    });
    expect(literalH1).toBeUndefined();
  });

  it("suggest-wiki-links appends only missing links and syncs them", async () => {
    const pageContext = {
      type: "editor" as const,
      pageId: "page-1",
      pageTitle: "Current Page",
      pageFullContent: "",
    };
    const { result } = renderHook(() => useAIChatActions({ pageContext }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "suggest-wiki-links",
        links: [
          { keyword: "Alpha", existingPageTitle: "Alpha" },
          { keyword: "Alpha", existingPageTitle: "Alpha" },
          { keyword: "Beta", existingPageTitle: "Beta" },
        ],
        reason: "test",
      });
    });

    // 本番経路は `{ dropLeadingH1: true }` を渡すが、`-` 始まりリストには影響なし。
    // The production path passes `{ dropLeadingH1: true }`; no leading `# X` ⇒ identical output.
    const expectedContent = appendMarkdownToTiptapContent("", "- [[Alpha]]\n- [[Beta]]", {
      dropLeadingH1: true,
    });
    expect(mockUpdatePageMutateAsync).toHaveBeenCalledWith({
      pageId: "page-1",
      updates: { content: expectedContent },
    });
    expect(mockSyncLinks).toHaveBeenCalledWith("page-1", [
      { title: "Alpha", exists: false, referenced: false },
      { title: "Beta", exists: false, referenced: false },
    ]);
    expect(mockContentAppendHandler).toHaveBeenCalledWith(expectedContent);
    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.notifications.wikiLinksAdded",
    });
  });

  it("create-multiple-pages creates each page and does not navigate", async () => {
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "create-multiple-pages",
        pages: [
          { title: "A", content: "body-a", suggestedLinks: [] },
          { title: "B", content: "body-b", suggestedLinks: [] },
        ],
        linkStructure: [],
        reason: "test",
      });
    });

    expect(mockCreatePageMutateAsync).toHaveBeenCalledTimes(2);
    expect(mockCreatePageMutateAsync).toHaveBeenNthCalledWith(1, {
      title: "A",
      content: "body-a",
    });
    expect(mockCreatePageMutateAsync).toHaveBeenNthCalledWith(2, {
      title: "B",
      content: "body-b",
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("append-to-page shows appendUnavailable when page title does not match", async () => {
    const pageContext = {
      type: "editor" as const,
      pageId: "page-1",
      pageTitle: "Current Page",
      pageFullContent: "",
    };
    const { result } = renderHook(() => useAIChatActions({ pageContext }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "append-to-page",
        pageTitle: "Other",
        content: "x",
        reason: "test",
      });
    });

    expect(mockUpdatePageMutateAsync).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.notifications.appendUnavailable",
      variant: "destructive",
    });
  });

  it("suggest-wiki-links shows noNewWikiLinks when all suggested titles are already present", async () => {
    const pageContext = {
      type: "editor" as const,
      pageId: "page-1",
      pageTitle: "Current Page",
      pageFullContent: JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [
                  {
                    type: "wikiLink",
                    attrs: { title: "Already", exists: false, referenced: false },
                  },
                ],
              },
            ],
          },
        ],
      }),
    };
    const { result } = renderHook(() => useAIChatActions({ pageContext }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "suggest-wiki-links",
        links: [{ keyword: "Already", existingPageTitle: "Already" }],
        reason: "test",
      });
    });

    expect(mockUpdatePageMutateAsync).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ title: "aiChat.notifications.noNewWikiLinks" });
  });

  it("append-to-page shows actionFailed and rolls back when syncLinks throws", async () => {
    const pageContext = {
      type: "editor" as const,
      pageId: "page-1",
      pageTitle: "Current Page",
      pageFullContent: "",
    };
    mockSyncLinks.mockRejectedValue(new Error("sync failed"));

    const { result } = renderHook(() => useAIChatActions({ pageContext }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "append-to-page",
        pageTitle: "Current Page",
        content: "Append body",
        reason: "test",
      });
    });

    expect(mockUpdatePageMutateAsync).toHaveBeenCalledTimes(2);
    expect(mockSyncLinks).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: "aiChat.notifications.actionFailed",
      variant: "destructive",
    });
  });

  it("create-page does not navigate when mutate returns no id", async () => {
    mockCreatePageMutateAsync.mockResolvedValueOnce({ id: undefined });
    const { result } = renderHook(() => useAIChatActions({ pageContext: null }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.handleExecuteAction({
        type: "create-page",
        title: "Solo",
        content: "c",
        suggestedLinks: [],
        reason: "test",
      });
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
