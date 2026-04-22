import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAIChatAction, type RunAIChatActionDeps } from "./runAIChatAction";
import type { ChatMessage } from "@/types/aiChat";

const t = ((key: string, opts?: Record<string, unknown>) => {
  if (opts && "title" in opts) return `${key}:${String(opts.title)}`;
  if (opts && "count" in opts) return `${key}:${String(opts.count)}`;
  return key;
}) as RunAIChatActionDeps["t"];

/** Minimal Tiptap JSON that already contains a wiki link to Alpha (for suggest-wiki-links guards). */
const TIPTAP_WITH_ALPHA_WIKI_LINK = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "x",
          marks: [
            { type: "wikiLink", attrs: { title: "Alpha", exists: false, referenced: false } },
          ],
        },
      ],
    },
  ],
});

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

describe("runAIChatAction — create", () => {
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
    expect(navigate).toHaveBeenCalledWith("/pages/new-page-1", {
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
    expect(navigate).toHaveBeenCalledWith("/pages/p1", {
      state: {
        pendingChatPageGeneration: {
          outline: "- o1",
          conversationText: expect.stringContaining("ctx"),
        },
      },
    });
  });

  it("create-multiple-pages: uses first non-empty outline when first page content is empty", async () => {
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
        { title: "First", content: "", suggestedLinks: [] },
        { title: "Second", content: "- from-second", suggestedLinks: [] },
      ],
      linkStructure: [],
      reason: "multi",
    });

    expect(navigate).toHaveBeenCalledWith("/pages/p1", {
      state: {
        pendingChatPageGeneration: {
          outline: "- from-second",
          conversationText: expect.stringContaining("ctx"),
        },
      },
    });
  });
});

describe("runAIChatAction — append and errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("append-to-page: shows appendFailed when append returns false", async () => {
    const toast = vi.fn();
    const appendContentToCurrentPage = vi.fn().mockResolvedValue(false);
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
    expect(toast).toHaveBeenCalledWith({
      title: "aiChat.notifications.appendFailed:Current",
      variant: "destructive",
    });
  });

  it("create-page: surfaces actionFailed when createPageMutateAsync rejects", async () => {
    const toast = vi.fn();
    const createPageMutateAsync = vi.fn().mockRejectedValue(new Error("network"));
    const deps = baseDeps({
      createPageMutateAsync,
      toast,
      messages: [],
    });

    await runAIChatAction(deps, {
      type: "create-page",
      title: "T",
      content: "",
      suggestedLinks: [],
      reason: "r",
    });

    expect(toast).toHaveBeenCalledWith({
      title: "aiChat.notifications.actionFailed",
      variant: "destructive",
    });
  });

  it("append-to-page: appends and shows appendSuccess when titles match", async () => {
    const toast = vi.fn();
    const appendContentToCurrentPage = vi.fn().mockResolvedValue(true);
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
    expect(toast).toHaveBeenCalledWith({
      title: "aiChat.notifications.appendSuccess:Current",
    });
  });
});

describe("runAIChatAction — append guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("append-to-page: shows pageContextRequired when pageId is missing", async () => {
    const toast = vi.fn();
    const appendContentToCurrentPage = vi.fn();
    const deps = baseDeps({
      pageContext: {
        type: "editor",
        pageId: "",
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

    expect(appendContentToCurrentPage).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: "aiChat.notifications.pageContextRequired",
      variant: "destructive",
    });
  });

  it("append-to-page: shows appendUnavailable when target title does not match current", async () => {
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
      pageTitle: "Other Page",
      content: "## More",
      reason: "r",
    });

    expect(appendContentToCurrentPage).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: "aiChat.notifications.appendUnavailable",
      variant: "destructive",
    });
  });
});

describe("runAIChatAction — suggest-wiki-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows pageContextRequired when pageId is missing", async () => {
    const toast = vi.fn();
    const appendContentToCurrentPage = vi.fn();
    const deps = baseDeps({
      pageContext: {
        type: "editor",
        pageId: "",
        pageTitle: "T",
        pageFullContent: "",
      },
      appendContentToCurrentPage,
      getLatestPageFullContent: () => "",
      toast,
    });

    await runAIChatAction(deps, {
      type: "suggest-wiki-links",
      links: [{ keyword: "A", existingPageTitle: "A" }],
      reason: "r",
    });

    expect(appendContentToCurrentPage).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: "aiChat.notifications.pageContextRequired",
      variant: "destructive",
    });
  });

  it("shows noNewWikiLinks when suggested titles are already linked in content", async () => {
    const toast = vi.fn();
    const appendContentToCurrentPage = vi.fn();
    const deps = baseDeps({
      pageContext: {
        type: "editor",
        pageId: "p1",
        pageTitle: "T",
        pageFullContent: TIPTAP_WITH_ALPHA_WIKI_LINK,
      },
      appendContentToCurrentPage,
      getLatestPageFullContent: () => TIPTAP_WITH_ALPHA_WIKI_LINK,
      toast,
    });

    await runAIChatAction(deps, {
      type: "suggest-wiki-links",
      links: [{ keyword: "Alpha", existingPageTitle: "Alpha" }],
      reason: "r",
    });

    expect(appendContentToCurrentPage).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ title: "aiChat.notifications.noNewWikiLinks" });
  });

  it("shows appendFailed when append returns false", async () => {
    const toast = vi.fn();
    const appendContentToCurrentPage = vi.fn().mockResolvedValue(false);
    const deps = baseDeps({
      pageContext: {
        type: "editor",
        pageId: "p1",
        pageTitle: "My Page",
        pageFullContent: "",
      },
      appendContentToCurrentPage,
      getLatestPageFullContent: () => "",
      toast,
    });

    await runAIChatAction(deps, {
      type: "suggest-wiki-links",
      links: [{ keyword: "Beta", existingPageTitle: "Beta" }],
      reason: "r",
    });

    expect(appendContentToCurrentPage).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: "aiChat.notifications.appendFailed:My Page",
      variant: "destructive",
    });
  });

  it("shows wikiLinksAdded on success", async () => {
    const toast = vi.fn();
    const appendContentToCurrentPage = vi.fn().mockResolvedValue(true);
    const deps = baseDeps({
      pageContext: {
        type: "editor",
        pageId: "p1",
        pageTitle: "T",
        pageFullContent: "",
      },
      appendContentToCurrentPage,
      getLatestPageFullContent: () => "",
      toast,
    });

    await runAIChatAction(deps, {
      type: "suggest-wiki-links",
      links: [{ keyword: "Gamma", existingPageTitle: "Gamma" }],
      reason: "r",
    });

    expect(appendContentToCurrentPage).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: "aiChat.notifications.wikiLinksAdded:1",
    });
  });
});

describe("runAIChatAction — create navigation guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create-page: does not navigate when create returns no id", async () => {
    const createPageMutateAsync = vi.fn().mockResolvedValue({ id: undefined });
    const navigate = vi.fn();
    const deps = baseDeps({ createPageMutateAsync, navigate, messages: [] });

    await runAIChatAction(deps, {
      type: "create-page",
      title: "T",
      outline: "",
      suggestedLinks: [],
      reason: "r",
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("create-multiple-pages: does not navigate when no page gets an id", async () => {
    const createPageMutateAsync = vi.fn().mockResolvedValue({});
    const navigate = vi.fn();
    const deps = baseDeps({ createPageMutateAsync, navigate, messages: [] });

    await runAIChatAction(deps, {
      type: "create-multiple-pages",
      pages: [{ title: "A", content: "", suggestedLinks: [] }],
      linkStructure: [],
      reason: "r",
    });

    expect(navigate).not.toHaveBeenCalled();
  });
});
