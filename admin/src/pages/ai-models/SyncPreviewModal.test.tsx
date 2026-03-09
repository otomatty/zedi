import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncPreviewModal } from "./SyncPreviewModal";

// Avoid Radix Dialog in test env (duplicate React instance with workspace deps)
vi.mock("@zedi/ui", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div
        data-testid="dialog-root"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        {children}
      </div>
    ) : null,
  DialogContent: ({ children, ...props }: { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("SyncPreviewModal", () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    onConfirm.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("open が false のとき何も描画しない", () => {
    render(
      <SyncPreviewModal
        open={false}
        loading={false}
        previewData={null}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("open が true のときダイアログとタイトルを表示", () => {
    render(
      <SyncPreviewModal
        open={true}
        loading={false}
        previewData={null}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("同期プレビュー")).toBeInTheDocument();
  });

  it("loading が true のとき「読み込み中...」を表示", () => {
    render(
      <SyncPreviewModal
        open={true}
        loading={true}
        previewData={null}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("previewData があるときプロバイダーと toAdd を表示", () => {
    const previewData = [
      {
        provider: "openai",
        toAdd: [
          {
            id: "openai:gpt-4",
            provider: "openai",
            modelId: "gpt-4",
            displayName: "GPT-4",
            tierRequired: "pro" as const,
            isActive: true,
          },
        ],
        toDeactivate: [
          {
            id: "openai:retired-model",
            provider: "openai",
            modelId: "retired-model",
            displayName: "Retired Model",
            tierRequired: "free" as const,
            isActive: false,
          },
        ],
        error: undefined,
      },
    ];
    render(
      <SyncPreviewModal
        open={true}
        loading={false}
        previewData={previewData}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("追加: GPT-4")).toBeInTheDocument();
    expect(screen.getByText("無効化: Retired Model")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /同期実行（追加 1 \/ 無効化 1）/ }),
    ).toBeInTheDocument();
  });

  it("キャンセルボタンで onClose を呼ぶ", async () => {
    const user = userEvent.setup();
    render(
      <SyncPreviewModal
        open={true}
        loading={false}
        previewData={null}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("同期実行ボタンで onConfirm を呼ぶ", async () => {
    const user = userEvent.setup();
    render(
      <SyncPreviewModal
        open={true}
        loading={false}
        previewData={[]}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: /同期実行/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("open 時にキャンセルボタンが存在する", async () => {
    render(
      <SyncPreviewModal
        open={true}
        loading={false}
        previewData={[]}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
    });
  });

  it("Escape キーで onClose を呼ぶ", async () => {
    const user = userEvent.setup();
    render(
      <SyncPreviewModal
        open={true}
        loading={false}
        previewData={[]}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog");
    dialog.focus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
