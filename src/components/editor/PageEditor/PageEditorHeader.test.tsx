import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageEditorHeader } from "./PageEditorHeader";

vi.mock("../WikiGeneratorButton", () => ({
  WikiGeneratorButton: ({
    title,
    hasContent,
    onGenerate,
    status,
  }: {
    title: string;
    hasContent: boolean;
    onGenerate: () => void;
    status: string;
  }) => (
    <button type="button" onClick={onGenerate} data-testid="wiki-generator-btn">
      wiki {title} {String(hasContent)} {status}
    </button>
  ),
}));

vi.mock("../ConnectionIndicator", () => ({
  ConnectionIndicator: ({ onReconnect }: { onReconnect: () => void }) => (
    <button type="button" onClick={onReconnect} data-testid="connection-indicator">
      接続状態
    </button>
  ),
}));

vi.mock("../UserAvatars", () => ({
  UserAvatars: () => <span data-testid="user-avatars">Avatars</span>,
}));

vi.mock("@/lib/dateUtils", () => ({
  formatTimeAgo: (ts: number) => `formatted:${ts}`,
}));

const defaultProps = {
  title: "テストページ",
  onTitleChange: vi.fn(),
  lastSaved: null as number | null,
  hasContent: false,
  wikiStatus: "idle" as const,
  errorMessage: null as string | null,
  onBack: vi.fn(),
  onDelete: vi.fn(),
  onExportMarkdown: vi.fn(),
  onCopyMarkdown: vi.fn(),
  onGenerateWiki: vi.fn(),
};

function renderHeader(overrides = {}) {
  return render(<PageEditorHeader {...defaultProps} {...overrides} />);
}

describe("PageEditorHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("表示", () => {
    it("タイトル入力とプレースホルダーを表示する", () => {
      renderHeader({ title: "我的ページ" });
      const input = screen.getByPlaceholderText("ページタイトル");
      expect(input).toHaveValue("我的ページ");
    });

    it("lastSaved があるとき「に保存」の表示がある", () => {
      renderHeader({ lastSaved: 1700000000000 });
      expect(screen.getByText(/formatted:1700000000000に保存/)).toBeInTheDocument();
    });

    it("lastSaved が null のとき「に保存」を表示しない", () => {
      renderHeader({ lastSaved: null });
      expect(screen.queryByText(/に保存/)).not.toBeInTheDocument();
    });

    it("errorMessage があるときタイトル入力に text-destructive クラスが付く", () => {
      const { container } = renderHeader({ errorMessage: "重複しています" });
      const input = container.querySelector('input[placeholder="ページタイトル"]');
      expect(input).toHaveClass("text-destructive");
    });

    it("errorMessage が null のときタイトル入力に text-destructive を付けない", () => {
      const { container } = renderHeader({ errorMessage: null });
      const input = container.querySelector('input[placeholder="ページタイトル"]');
      expect(input).not.toHaveClass("text-destructive");
    });

    it("collaboration を渡すと ConnectionIndicator と UserAvatars を表示する", () => {
      renderHeader({
        collaboration: {
          status: "connected",
          isSynced: true,
          onlineUsers: [],
          onReconnect: vi.fn(),
        },
      });
      expect(screen.getByTestId("connection-indicator")).toBeInTheDocument();
      expect(screen.getByTestId("user-avatars")).toBeInTheDocument();
    });

    it("collaboration を渡さないとき ConnectionIndicator を表示しない", () => {
      renderHeader();
      expect(screen.queryByTestId("connection-indicator")).not.toBeInTheDocument();
      expect(screen.queryByTestId("user-avatars")).not.toBeInTheDocument();
    });

    it("ストレージ表示用の UI は表示しない（ヘッダーから削除済み）", () => {
      renderHeader();
      expect(screen.queryByText("未設定")).not.toBeInTheDocument();
      expect(screen.queryByText("接続済み")).not.toBeInTheDocument();
    });
  });

  describe("インタラクション", () => {
    it("戻るボタンをクリックすると onBack が呼ばれる", async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      renderHeader({ onBack });
      const buttons = screen.getAllByRole("button");
      const backButton = buttons[0];
      await user.click(backButton);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("タイトルを変更すると onTitleChange が呼ばれる", async () => {
      const user = userEvent.setup();
      const onTitleChange = vi.fn();
      renderHeader({ onTitleChange });
      const input = screen.getByPlaceholderText("ページタイトル");
      await user.clear(input);
      await user.type(input, "新しいタイトル");
      expect(onTitleChange).toHaveBeenCalled();
    });

    it("Wiki Generator ボタンをクリックすると onGenerateWiki が呼ばれる", async () => {
      const user = userEvent.setup();
      const onGenerateWiki = vi.fn();
      renderHeader({ onGenerateWiki });
      await user.click(screen.getByTestId("wiki-generator-btn"));
      expect(onGenerateWiki).toHaveBeenCalledTimes(1);
    });

    it("ドロップダウンを開き Markdownでエクスポート をクリックすると onExportMarkdown が呼ばれる", async () => {
      const user = userEvent.setup();
      const onExportMarkdown = vi.fn();
      renderHeader({ onExportMarkdown });
      const buttons = screen.getAllByRole("button");
      const menuTrigger = buttons[buttons.length - 1];
      await user.click(menuTrigger);
      const exportItem = await screen.findByRole("menuitem", {
        name: /Markdownでエクスポート/,
      });
      await user.click(exportItem);
      expect(onExportMarkdown).toHaveBeenCalledTimes(1);
    });

    it("ドロップダウンで Markdownをコピー をクリックすると onCopyMarkdown が呼ばれる", async () => {
      const user = userEvent.setup();
      const onCopyMarkdown = vi.fn();
      renderHeader({ onCopyMarkdown });
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[buttons.length - 1]);
      const copyItem = await screen.findByRole("menuitem", { name: /Markdownをコピー/ });
      await user.click(copyItem);
      expect(onCopyMarkdown).toHaveBeenCalledTimes(1);
    });

    it("ドロップダウンで 削除 をクリックすると onDelete が呼ばれる", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      renderHeader({ onDelete });
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[buttons.length - 1]);
      const deleteItem = await screen.findByRole("menuitem", { name: /削除/ });
      await user.click(deleteItem);
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("collaboration ありで ConnectionIndicator の onReconnect をクリックすると onReconnect が呼ばれる", async () => {
      const user = userEvent.setup();
      const onReconnect = vi.fn();
      renderHeader({
        collaboration: {
          status: "disconnected",
          isSynced: false,
          onlineUsers: [],
          onReconnect,
        },
      });
      await user.click(screen.getByTestId("connection-indicator"));
      expect(onReconnect).toHaveBeenCalledTimes(1);
    });
  });
});
