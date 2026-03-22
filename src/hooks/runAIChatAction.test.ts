import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAIChatAction, type RunAIChatActionDeps } from "./runAIChatAction";
import type { ChatMessage } from "@/types/aiChat";

const t = ((key: string, opts?: Record<string, unknown>) => {
  if (opts && "title" in opts) return `${key}:${String(opts.title)}`;
  if (opts && "count" in opts) return `${key}:${String(opts.count)}`;
  return key;
}) as RunAIChatActionDeps["t"];

function baseDeps(overrides: Partial<RunAIChatActionDeps> = {}): RunAIChatActionDeps {
  return {
    pageContext: null,
    messages: [],
    createPageMutateAsync: vi.fn(),
    navigate: vi.fn(),
    appendContentToCurrentPage: vi.fn().mockResolvedValue(true),
    getLatestPageFullContent: () => "",
    t,
    toast: vi.fn(),
    ...overrides,
  };
}

describe("runAIChatAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create-page: creates empty page and navigates with pendingChatPageGeneration state", async () => {
    const createPageMutateAsync = vi.fn().mockResolvedValue({ id: "new-page-1" });
    const navigate = vi.fn();
    const messages: ChatMessage[] = [{ id: "1", role: "user", content: "hello", timestamp: 1 }];
    const deps = baseDeps({ createPageMutateAsync, navigate, messages });

    await runAIChatAction(deps, {
      type: "create-page",
      title: "Wiki Topic",
      outline: "- A\n- B",
      suggestedLinks: [],
      reason: "test",
    });

    expect(createPageMutateAsync).toHaveBeenCalledWith({
      title: "Wiki Topic",
      content: "",
    });
    expect(navigate).toHaveBeenCalledWith("/page/new-page-1", {
      state: {
        pendingChatPageGeneration: {
          outline: "- A\n- B",
          conversationText: expect.stringContaining("hello"),
        },
      },
    });
  });

  it("create-multiple-pages: navigates to first created id with first page outline", async () => {
    const createPageMutateAsync = vi
      .fn()
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce({ id: "p2" });
    const navigate = vi.fn();
    const deps = baseDeps({
      createPageMutateAsync,
      navigate,
      messages: [{ id: "1", role: "assistant", content: "ctx", timestamp: 1 }],
    });

    await runAIChatAction(deps, {
      type: "create-multiple-pages",
      pages: [
        { title: "First", content: "- o1", suggestedLinks: [] },
        { title: "Second", content: "- o2", suggestedLinks: [] },
      ],
      linkStructure: [],
      reason: "multi",
    });

    expect(createPageMutateAsync).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("/page/p1", {
      state: {
        pendingChatPageGeneration: {
          outline: "- o1",
          conversationText: expect.stringContaining("ctx"),
        },
      },
    });
  });

  it("append-to-page: requires matching page context", async () => {
    const toast = vi.fn();
    const appendContentToCurrentPage = vi.fn();
    const deps = baseDeps({
      pageContext: {
        type: "editor",
        pageId: "x",
        pageTitle: "Current",
        pageFullContent: "",
      },
      appendContentToCurrentPage,
      toast,
    });

    await runAIChatAction(deps, {
      type: "append-to-page",
      pageTitle: "Current",
      content: "## More",
      reason: "r",
    });

    expect(appendContentToCurrentPage).toHaveBeenCalledWith("## More");
    expect(toast).toHaveBeenCalled();
  });
});
