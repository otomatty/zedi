import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncPreviewModal } from "./SyncPreviewModal";

describe("SyncPreviewModal", () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

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
    expect(screen.getByText("GPT-4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /同期実行（1 件追加）/ })).toBeInTheDocument();
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
});
