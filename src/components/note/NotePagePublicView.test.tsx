import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotePagePublicView } from "./NotePagePublicView";
import { useNoteApi } from "@/hooks/useNoteQueries";
import { ApiError } from "@/lib/api";
import type { Page } from "@/types/page";

// vi.hoisted: vi.mock のファクトリは hoisting されるため、共有 mock を
// 巻き上げてファクトリ内から参照できるようにする。
// Hoist shared mocks so the `vi.mock` factories (which run before module
// imports) can reference them.
const { mockApi, mockPageEditorContent } = vi.hoisted(() => ({
  mockApi: {
    getPagePublicContent: vi.fn(),
  },
  mockPageEditorContent: vi.fn(),
}));

// react-i18next: テストで生キーが DOM に出る前提に依存しないように
// `t(key, fallback)` の挙動を明示的にモックする。
// Mock react-i18next so `t(key, fallback)` returns the fallback (or key)
// without requiring the real i18n boot.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNoteApi: vi.fn(),
}));

vi.mock("@zedi/ui", () => ({
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  }) => (
    <button type="button" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/layout/PageLoadingOrDenied", () => ({
  PageLoadingOrDenied: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="loading-shell">{children}</div>
  ),
}));

vi.mock("./PageEditorContent", () => ({
  PageEditorContent: (props: Record<string, unknown>) => {
    mockPageEditorContent(props);
    return (
      <div
        data-testid="page-editor-content"
        data-title={String(props.title ?? "")}
        data-read-only={String(props.isReadOnly ?? false)}
        data-show-linked-pages={String(props.showLinkedPages ?? false)}
        data-show-toolbar={String(props.showToolbar ?? false)}
        data-current-page-id={String(props.currentPageId ?? "null")}
        data-page-id={String(props.pageId ?? "")}
      />
    );
  },
}));

/**
 * Build a `Page` fixture for tests. Only the fields read by `NotePagePublicView`
 * are realistic — others are filled with safe defaults.
 *
 * テスト用 `Page` フィクスチャ。`NotePagePublicView` から参照されないフィールドは
 * 既定値で埋める。
 */
function buildPage(overrides: Partial<Page> = {}): Page {
  return {
    id: "page-1",
    ownerUserId: "user-1",
    noteId: "note-1",
    title: "Cached Title",
    content: "",
    createdAt: 0,
    updatedAt: 0,
    isDeleted: false,
    sourceUrl: undefined,
    ...overrides,
  };
}

/**
 * Wrap the unit-under-test in a fresh `QueryClient` so that error / retry
 * behavior settles without leaking state across tests.
 *
 * テストごとに新しい `QueryClient` を切ってラップする。`retry: false` で
 * エラーケースが即時確定し、`gcTime: 0` で前テストの結果がリークしない。
 */
function renderView(page: Page = buildPage()) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotePagePublicView pageId={page.id} page={page} />
    </QueryClientProvider>,
  );
}

describe("NotePagePublicView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNoteApi).mockReturnValue({
      api: mockApi,
      userId: undefined,
      userEmail: undefined,
      isSignedIn: false,
      isLoaded: true,
    } as never);
  });

  it("ローディング中はローディングシェルを描画し、PageEditorContent は出さない / shows a loading shell while the public-content query is pending", () => {
    // Never-resolving promise to keep `isLoading` true.
    mockApi.getPagePublicContent.mockReturnValue(new Promise(() => undefined));

    renderView();

    expect(screen.getByTestId("loading-shell")).toBeInTheDocument();
    // i18n モックは fallback が無いと key をそのまま返す。NotePageView.test.tsx と同じ規約。
    // The i18n mock echoes the raw key when no fallback is provided, mirroring
    // the convention used in NotePageView.test.tsx.
    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByTestId("page-editor-content")).not.toBeInTheDocument();
  });

  it("成功時は PageEditorContent に変換済み Tiptap doc を渡して描画する / hands the converted Tiptap doc to PageEditorContent", async () => {
    mockApi.getPagePublicContent.mockResolvedValue({
      id: "page-1",
      title: "Public title",
      content_text: "hello\nworld",
      content_preview: null,
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
    });

    renderView();

    const editor = await screen.findByTestId("page-editor-content");
    expect(editor).toHaveAttribute("data-title", "Public title");
    expect(editor).toHaveAttribute("data-read-only", "true");
    expect(editor).toHaveAttribute("data-show-linked-pages", "false");
    expect(editor).toHaveAttribute("data-show-toolbar", "false");
    expect(editor).toHaveAttribute("data-current-page-id", "null");
    expect(editor).toHaveAttribute("data-page-id", "page-1");

    // `content` should be a JSON.stringify-ed Tiptap doc containing the two
    // paragraphs derived from `content_text`.
    // `content` は `content_text` から生成された段落 2 つを含む Tiptap doc 文字列。
    const calls = mockPageEditorContent.mock.calls;
    const lastCall = calls[calls.length - 1];
    if (!lastCall) throw new Error("PageEditorContent was never invoked");
    const props = lastCall[0] as { content: string };
    const parsed = JSON.parse(props.content) as { type: string; content: unknown[] };
    expect(parsed.type).toBe("doc");
    expect(JSON.stringify(parsed)).toContain("hello");
    expect(JSON.stringify(parsed)).toContain("world");
  });

  it("response.title が null なら page.title にフォールバックする / falls back to the cached page title when the response title is null", async () => {
    mockApi.getPagePublicContent.mockResolvedValue({
      id: "page-1",
      title: null,
      content_text: "body",
      content_preview: null,
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
    });

    renderView(buildPage({ title: "Cached fallback" }));

    const editor = await screen.findByTestId("page-editor-content");
    expect(editor).toHaveAttribute("data-title", "Cached fallback");
  });

  it("content_text が null なら content は空文字 (JSON.parse 失敗を起こさない) / passes empty content when content_text is null", async () => {
    mockApi.getPagePublicContent.mockResolvedValue({
      id: "page-1",
      title: "Empty",
      content_text: null,
      content_preview: null,
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
    });

    renderView();

    await screen.findByTestId("page-editor-content");
    const calls = mockPageEditorContent.mock.calls;
    const lastCall = calls[calls.length - 1];
    if (!lastCall) throw new Error("PageEditorContent was never invoked");
    const props = lastCall[0] as { content: string };
    expect(props.content).toBe("");
  });

  it("404 はゲスト向け文言を出す / surfaces a not-found message on 404", async () => {
    mockApi.getPagePublicContent.mockRejectedValue(new ApiError("Page not found", 404));

    renderView();

    expect(await screen.findByText("ページが見つかりません")).toBeInTheDocument();
    // 404 では retry ボタンを出さない。
    // No retry button is offered for 404.
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("page-editor-content")).not.toBeInTheDocument();
  });

  it("403 は閲覧権限ありませんメッセージを出す / surfaces a forbidden message on 403", async () => {
    mockApi.getPagePublicContent.mockRejectedValue(new ApiError("Forbidden", 403));

    renderView();

    expect(await screen.findByText("閲覧権限がありません")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("その他のエラーには汎用メッセージと再試行ボタンを出す / shows a generic error with a retry button on other failures", async () => {
    mockApi.getPagePublicContent.mockRejectedValue(new ApiError("boom", 500));

    renderView();

    expect(await screen.findByText("ページの読み込みに失敗しました")).toBeInTheDocument();

    // 再試行ボタンが query 関数を再呼び出しすることを確認。
    // Verify retry triggers another invocation of the query function.
    const retryButton = screen.getByRole("button", { name: "Retry" });
    mockApi.getPagePublicContent.mockResolvedValueOnce({
      id: "page-1",
      title: "After retry",
      content_text: "ok",
      content_preview: null,
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
    });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(mockApi.getPagePublicContent).toHaveBeenCalledTimes(2);
    });
  });
});
