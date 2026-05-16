/**
 * PageEditorLayout コンポーネントのテスト（履歴モーダル関連）
 * Tests for PageEditorLayout (history modal integration)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageEditorLayout } from "./PageEditorLayout";
import type { PageEditorLayoutProps } from "./PageEditorLayout";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./PageEditorHeader", () => ({
  PageEditorHeader: ({
    menuItems,
  }: {
    menuItems?: Array<{ id: string; label: string; onClick: () => void }>;
  }) => {
    // PageEditorLayout は履歴メニュー項目を `menuItems` 配列で渡すように変更された
    // ため、テストでも id ベースで該当項目を引いて click をディスパッチする。
    // PageEditorLayout now passes the history action via the `menuItems` array,
    // so the mock surfaces buttons keyed by id (matching the production
    // toolbar item ids) instead of the old per-prop callbacks.
    const historyItem = menuItems?.find((item) => item.id === "history");
    return (
      <div data-testid="editor-header">
        {historyItem && (
          <button data-testid="open-history-btn" onClick={historyItem.onClick}>
            Open History
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("./PageEditorAlerts", () => ({
  PageEditorAlerts: () => <div data-testid="editor-alerts" />,
}));

vi.mock("./PageEditorContent", () => ({
  PageEditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock("./PageEditorDialogs", () => ({
  PageEditorDialogs: () => <div data-testid="editor-dialogs" />,
}));

vi.mock("../../ai-chat/ContentWithAIChat", () => ({
  ContentWithAIChat: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ai-chat-wrapper">{children}</div>
  ),
}));

vi.mock("../pageHistory/PageHistoryModal", () => ({
  PageHistoryModal: ({
    open,
    onRestored,
    onOpenChange,
  }: {
    open: boolean;
    currentYdoc: unknown;
    onRestored?: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="history-modal">
        <button data-testid="restore-btn" onClick={onRestored}>
          Restore
        </button>
        <button data-testid="close-modal-btn" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    ) : null,
}));

const defaultProps: PageEditorLayoutProps = {
  title: "Test Page",
  content: "",
  sourceUrl: undefined,
  currentPageId: "page-1",
  pageId: "page-1",
  isNewPage: false,
  displayLastSaved: null,
  wikiStatus: "idle",
  isWikiGenerating: false,
  isSyncingLinks: false,
  isLocalDocEnabled: false,
  collaboration: undefined,
  duplicatePage: null,
  errorMessage: null,
  contentError: null,
  pendingInitialContent: null,
  onBack: vi.fn(),
  onDelete: vi.fn(),
  onExportMarkdown: vi.fn(),
  onCopyMarkdown: vi.fn(),
  onGenerateWiki: vi.fn(),
  onOpenDuplicatePage: vi.fn(),
  onCancelWiki: vi.fn(),
  onContentChange: vi.fn(),
  onContentError: vi.fn(),
  onTitleChange: vi.fn(),
  onPendingInitialContentClear: vi.fn(),
  deleteConfirmOpen: false,
  deleteReason: "",
  onDeleteConfirmOpenChange: vi.fn(),
  onConfirmDelete: vi.fn(),
  onCancelDelete: vi.fn(),
  wikiErrorMessage: null,
  onResetWiki: vi.fn(),
  onGoToAISettings: vi.fn(),
  wikiContentForCollab: null,
  onWikiContentApplied: vi.fn(),
};

describe("PageEditorLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("主要な子コンポーネントをレンダリングする / renders main child components", () => {
    render(<PageEditorLayout {...defaultProps} />);

    expect(screen.getByTestId("editor-header")).toBeInTheDocument();
    expect(screen.getByTestId("editor-alerts")).toBeInTheDocument();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    expect(screen.getByTestId("editor-dialogs")).toBeInTheDocument();
  });

  it("初期状態では履歴モーダルが表示されない / history modal is hidden by default", () => {
    render(<PageEditorLayout {...defaultProps} />);

    expect(screen.queryByTestId("history-modal")).not.toBeInTheDocument();
  });

  it("履歴ボタンをクリックすると履歴モーダルが表示される / shows history modal after clicking open history", async () => {
    const user = userEvent.setup();
    render(<PageEditorLayout {...defaultProps} />);

    await user.click(screen.getByTestId("open-history-btn"));

    expect(screen.getByTestId("history-modal")).toBeInTheDocument();
  });

  it("モーダルを閉じると非表示になる / hides modal on close", async () => {
    const user = userEvent.setup();
    render(<PageEditorLayout {...defaultProps} />);

    await user.click(screen.getByTestId("open-history-btn"));
    expect(screen.getByTestId("history-modal")).toBeInTheDocument();

    await user.click(screen.getByTestId("close-modal-btn"));
    expect(screen.queryByTestId("history-modal")).not.toBeInTheDocument();
  });

  it("復元後に window.location.reload が呼ばれる / calls reload on restore", async () => {
    const user = userEvent.setup();
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(<PageEditorLayout {...defaultProps} />);

    await user.click(screen.getByTestId("open-history-btn"));
    await user.click(screen.getByTestId("restore-btn"));

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
