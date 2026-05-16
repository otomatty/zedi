import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Copy, Download, History, Trash2 } from "lucide-react";
import { PageEditorHeader, type PageDetailToolbarAction } from "./PageEditorHeader";

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

// `useTranslation` をモックして、i18n インスタンス未初期化エラーを避けつつ
// `editor.savedAt` の実テンプレートを再現する。
// Stub `useTranslation` so the test does not boot i18next, and reproduce the
// actual `editor.savedAt` template behaviour.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) => {
      if (key === "editor.savedAt" && typeof opts === "object" && opts?.relative !== undefined) {
        return `${String(opts.relative)}に保存`;
      }
      if (typeof opts === "string") return opts;
      return key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: () => undefined },
}));

vi.mock("@/contexts/GlobalSearchContext", () => ({
  useGlobalSearchContextOptional: () => null,
}));

/**
 * `/pages/:id` の既定アクションメニュー項目をテストヘルパーとして組み立てる。
 * 既存テストが `onDelete` / `onExportMarkdown` などの個別 prop に依存していたため、
 * 新しい `menuItems` API でも同じ振る舞いを再現できることを示す。
 *
 * Build the same default-action menu items `/pages/:id` uses, so the tests
 * exercise the new `menuItems` API end-to-end while preserving the labels
 * and callbacks the old per-prop API exposed.
 */
function buildPageEditorMenuItems(opts: {
  onDelete: () => void;
  onExportMarkdown: () => void;
  onCopyMarkdown: () => void;
  onOpenHistory?: () => void;
}): PageDetailToolbarAction[] {
  const items: PageDetailToolbarAction[] = [];
  if (opts.onOpenHistory) {
    items.push({
      id: "history",
      label: "変更履歴",
      icon: History,
      onClick: opts.onOpenHistory,
    });
  }
  items.push({
    id: "export-markdown",
    label: "Markdownでエクスポート",
    icon: Download,
    onClick: opts.onExportMarkdown,
  });
  items.push({
    id: "copy-markdown",
    label: "Markdownをコピー",
    icon: Copy,
    onClick: opts.onCopyMarkdown,
  });
  items.push({
    id: "delete",
    label: "削除",
    icon: Trash2,
    onClick: opts.onDelete,
    destructive: true,
    separatorBefore: true,
  });
  return items;
}

interface RenderOverrides {
  lastSaved?: number | null;
  onBack?: () => void;
  onDelete?: () => void;
  onExportMarkdown?: () => void;
  onCopyMarkdown?: () => void;
  onOpenHistory?: () => void;
  menuItems?: PageDetailToolbarAction[];
  supplementalRightContent?: React.ReactNode;
  collaboration?: React.ComponentProps<typeof PageEditorHeader>["collaboration"];
  includeDefaultMenu?: boolean;
}

function renderHeader(overrides: RenderOverrides = {}) {
  const {
    lastSaved = null,
    onBack = vi.fn(),
    onDelete = vi.fn(),
    onExportMarkdown = vi.fn(),
    onCopyMarkdown = vi.fn(),
    onOpenHistory,
    menuItems,
    supplementalRightContent,
    collaboration,
    includeDefaultMenu = true,
  } = overrides;

  const resolvedMenuItems =
    menuItems ??
    (includeDefaultMenu
      ? buildPageEditorMenuItems({ onDelete, onExportMarkdown, onCopyMarkdown, onOpenHistory })
      : undefined);

  return render(
    <PageEditorHeader
      lastSaved={lastSaved}
      onBack={onBack}
      menuItems={resolvedMenuItems}
      supplementalRightContent={supplementalRightContent}
      collaboration={collaboration}
    />,
  );
}

describe("PageEditorHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("表示", () => {
    it("lastSaved があるとき「に保存」の表示がある", () => {
      renderHeader({ lastSaved: 1700000000000 });
      expect(screen.getByText(/formatted:1700000000000に保存/)).toBeInTheDocument();
    });

    it("lastSaved が null のとき「に保存」を表示しない", () => {
      renderHeader({ lastSaved: null });
      expect(screen.queryByText(/に保存/)).not.toBeInTheDocument();
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

    it("menuItems が空または未指定のとき、… ボタン自体を表示しない / hides the more-actions button when no menu items", () => {
      renderHeader({ includeDefaultMenu: false });
      // back button のみで more-actions のトリガーは存在しないはず
      // Only the back button is present; the menu trigger should be absent.
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
    });

    it("supplementalRightContent を渡すと右側に追加コンテンツを表示する / renders supplemental right content", () => {
      renderHeader({
        supplementalRightContent: <span data-testid="extra">閲覧専用</span>,
      });
      expect(screen.getByTestId("extra")).toHaveTextContent("閲覧専用");
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

    it("onOpenHistory を渡すとドロップダウンに変更履歴メニューが表示される", async () => {
      const user = userEvent.setup();
      const onOpenHistory = vi.fn();
      renderHeader({ onOpenHistory });
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[buttons.length - 1]);
      const historyItem = await screen.findByRole("menuitem", { name: /変更履歴|pageHistory/ });
      await user.click(historyItem);
      expect(onOpenHistory).toHaveBeenCalledTimes(1);
    });

    it("onOpenHistory を渡さないとき変更履歴メニューは表示されない", async () => {
      const user = userEvent.setup();
      renderHeader();
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[buttons.length - 1]);
      // 変更履歴メニューが存在しないことを確認
      const historyItems = screen
        .queryAllByRole("menuitem")
        .filter(
          (el) => el.textContent?.includes("変更履歴") || el.textContent?.includes("pageHistory"),
        );
      expect(historyItems).toHaveLength(0);
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

    it("カスタム menuItems が表示され、クリックでハンドラが呼ばれる / renders custom menu items and routes clicks", async () => {
      const user = userEvent.setup();
      const onCopyToPersonal = vi.fn();
      renderHeader({
        menuItems: [
          {
            id: "copy-to-personal",
            label: "個人に取り込み",
            icon: Download,
            onClick: onCopyToPersonal,
          },
        ],
      });
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[buttons.length - 1]);
      const item = await screen.findByRole("menuitem", { name: /個人に取り込み/ });
      await user.click(item);
      expect(onCopyToPersonal).toHaveBeenCalledTimes(1);
    });

    it("menuItems の disabled をセットすると DropdownMenuItem の data-disabled が立つ / honours disabled flag", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      renderHeader({
        menuItems: [
          {
            id: "copy-to-personal",
            label: "個人に取り込み",
            onClick,
            disabled: true,
          },
        ],
      });
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[buttons.length - 1]);
      const item = await screen.findByRole("menuitem", { name: /個人に取り込み/ });
      expect(item).toHaveAttribute("data-disabled");
    });

    it("スクロールで非表示になったヘッダーはフォーカス対象から外れる", async () => {
      const { container } = render(
        <div style={{ overflowY: "auto" }}>
          <PageEditorHeader onBack={vi.fn()} />
        </div>,
      );

      const backButton = screen.getByRole("button", { name: /戻る|back/i });
      const scrollContainer = container.firstElementChild as HTMLElement | null;
      const header = scrollContainer?.firstElementChild as HTMLElement | null;
      expect(scrollContainer).not.toBeNull();
      expect(header).not.toBeNull();

      backButton.focus();
      expect(backButton).toHaveFocus();

      if (!scrollContainer) {
        throw new Error("scroll container not found");
      }
      await act(async () => {
        scrollContainer.scrollTop = 24;
        scrollContainer.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(header).toHaveAttribute("aria-hidden", "true");
      });
      expect(backButton).not.toHaveFocus();
    });
  });
});
