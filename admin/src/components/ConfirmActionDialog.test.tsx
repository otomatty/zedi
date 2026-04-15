import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmActionDialog } from "./ConfirmActionDialog";

// AlertDialog のモック / Mock AlertDialog components from @zedi/ui
vi.mock("@zedi/ui", () => {
  const AlertDialogContext = React.createContext<{ onOpenChange: (open: boolean) => void } | null>(
    null,
  );

  return {
    AlertDialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) =>
      open ? (
        <AlertDialogContext.Provider value={{ onOpenChange }}>
          <div data-testid="alert-dialog" data-open={open}>
            {children}
            <button type="button" data-testid="backdrop" onClick={() => onOpenChange(false)}>
              backdrop
            </button>
          </div>
        </AlertDialogContext.Provider>
      ) : null,
    AlertDialogContent: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
    }) => (
      <div data-testid="alert-dialog-content" {...props}>
        {children}
      </div>
    ),
    AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="alert-dialog-header">{children}</div>
    ),
    AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="alert-dialog-footer">{children}</div>
    ),
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
      <h2 data-testid="alert-dialog-title">{children}</h2>
    ),
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
      <p data-testid="alert-dialog-description">{children}</p>
    ),
    AlertDialogCancel: ({
      children,
      disabled,
      ...props
    }: {
      children: React.ReactNode;
      disabled?: boolean;
    }) => (
      <button type="button" data-testid="cancel-button" disabled={disabled} {...props}>
        {children}
      </button>
    ),
    AlertDialogAction: ({
      children,
      onClick,
      disabled,
      className,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: (e: React.MouseEvent) => void;
      disabled?: boolean;
      className?: string;
    }) => {
      const dialog = React.useContext(AlertDialogContext);
      return (
        <button
          type="button"
          data-testid="confirm-button"
          disabled={disabled}
          className={className}
          onClick={(e) => {
            onClick?.(e);
            if (!e.defaultPrevented) {
              dialog?.onOpenChange(false);
            }
          }}
          {...props}
        >
          {children}
        </button>
      );
    },
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
  };
});

vi.mock("@zedi/ui/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

describe("ConfirmActionDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: "テストタイトル",
    description: "テスト説明文",
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("タイトルと説明文を表示する / renders title and description", () => {
    render(<ConfirmActionDialog {...defaultProps} />);

    expect(screen.getByTestId("alert-dialog-title")).toHaveTextContent("テストタイトル");
    expect(screen.getByTestId("alert-dialog-description")).toHaveTextContent("テスト説明文");
  });

  it("open=false の場合はダイアログを表示しない / does not render when open is false", () => {
    render(<ConfirmActionDialog {...defaultProps} open={false} />);

    expect(screen.queryByTestId("alert-dialog")).not.toBeInTheDocument();
  });

  it("確認ボタンクリックで onConfirm を呼ぶ / calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmActionDialog {...defaultProps} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByTestId("confirm-button"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("有効な確認クリックでダイアログを閉じる / closes dialog after enabled confirm click", async () => {
    const onOpenChange = vi.fn();
    render(<ConfirmActionDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await userEvent.click(screen.getByTestId("confirm-button"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("キャンセルボタンのデフォルトラベルは「キャンセル」/ cancel button shows default label", () => {
    render(<ConfirmActionDialog {...defaultProps} />);

    expect(screen.getByTestId("cancel-button")).toHaveTextContent("キャンセル");
  });

  it("確認ボタンのデフォルトラベルは「確認」/ confirm button shows default label", () => {
    render(<ConfirmActionDialog {...defaultProps} />);

    expect(screen.getByTestId("confirm-button")).toHaveTextContent("確認");
  });

  it("confirmLabel でカスタムラベルを設定できる / supports custom confirm label", () => {
    render(<ConfirmActionDialog {...defaultProps} confirmLabel="削除する" />);

    expect(screen.getByTestId("confirm-button")).toHaveTextContent("削除する");
  });

  it("loading 中は「処理中...」を表示する / shows loading text when loading", () => {
    render(<ConfirmActionDialog {...defaultProps} loading />);

    expect(screen.getByTestId("confirm-button")).toHaveTextContent("処理中...");
  });

  it("loading 中は確認ボタンが無効化される / confirm button is disabled when loading", () => {
    render(<ConfirmActionDialog {...defaultProps} loading />);

    expect(screen.getByTestId("confirm-button")).toBeDisabled();
  });

  it("loading 中はキャンセルボタンも無効化される / cancel button is disabled when loading", () => {
    render(<ConfirmActionDialog {...defaultProps} loading />);

    expect(screen.getByTestId("cancel-button")).toBeDisabled();
  });

  it("loading 中に確認ボタンをクリックしても onConfirm を呼ばない / does not call onConfirm when loading", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmActionDialog {...defaultProps} onConfirm={onConfirm} loading />);

    await userEvent.click(screen.getByTestId("confirm-button"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("destructive=true で破壊的スタイルが適用される / applies destructive styling", () => {
    render(<ConfirmActionDialog {...defaultProps} destructive />);

    const btn = screen.getByTestId("confirm-button");
    expect(btn.className).toContain("bg-destructive");
  });

  describe("確認フレーズ / Confirm phrase", () => {
    it("confirmPhrase が設定されると入力フィールドを表示する / shows input when confirmPhrase is set", () => {
      render(<ConfirmActionDialog {...defaultProps} confirmPhrase="delete-me" />);

      expect(screen.getByLabelText(/delete-me/)).toBeInTheDocument();
    });

    it("確認フレーズが一致しないと確認ボタンが無効化される / confirm button is disabled when phrase does not match", () => {
      render(<ConfirmActionDialog {...defaultProps} confirmPhrase="delete-me" />);

      expect(screen.getByTestId("confirm-button")).toBeDisabled();
    });

    it("確認フレーズが一致すると確認ボタンが有効化される / confirm button is enabled when phrase matches", async () => {
      render(<ConfirmActionDialog {...defaultProps} confirmPhrase="delete-me" />);

      const input = screen.getByPlaceholderText("delete-me");
      await userEvent.type(input, "delete-me");

      expect(screen.getByTestId("confirm-button")).not.toBeDisabled();
    });

    it("確認フレーズが部分一致では確認ボタンが無効化されたまま / partial match keeps button disabled", async () => {
      render(<ConfirmActionDialog {...defaultProps} confirmPhrase="delete-me" />);

      const input = screen.getByPlaceholderText("delete-me");
      await userEvent.type(input, "delete");

      expect(screen.getByTestId("confirm-button")).toBeDisabled();
    });

    it("確認フレーズ一致後に確認ボタンクリックで onConfirm を呼ぶ / calls onConfirm after phrase match and click", async () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmActionDialog {...defaultProps} onConfirm={onConfirm} confirmPhrase="delete-me" />,
      );

      const input = screen.getByPlaceholderText("delete-me");
      await userEvent.type(input, "delete-me");
      await userEvent.click(screen.getByTestId("confirm-button"));

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("確認後に phraseInput がリセットされる / resets phraseInput after confirm", async () => {
      const onConfirm = vi.fn();
      const { rerender } = render(
        <ConfirmActionDialog
          {...defaultProps}
          open={true}
          onConfirm={onConfirm}
          confirmPhrase="delete-me"
        />,
      );

      const input = screen.getByPlaceholderText("delete-me");
      await userEvent.type(input, "delete-me");
      await userEvent.click(screen.getByTestId("confirm-button"));
      expect(onConfirm).toHaveBeenCalledTimes(1);

      // 親がダイアログを閉じて再度開く / Parent closes and reopens dialog
      rerender(
        <ConfirmActionDialog
          {...defaultProps}
          open={false}
          onConfirm={onConfirm}
          confirmPhrase="delete-me"
        />,
      );
      rerender(
        <ConfirmActionDialog
          {...defaultProps}
          open={true}
          onConfirm={onConfirm}
          confirmPhrase="delete-me"
        />,
      );

      // 確認ボタンが無効化されている（phraseInput がリセット済み）
      // Confirm button should be disabled (phraseInput was reset)
      expect(screen.getByTestId("confirm-button")).toBeDisabled();
    });

    it("カスタム confirmPhraseLabel を設定できる / supports custom phrase label", () => {
      render(
        <ConfirmActionDialog
          {...defaultProps}
          confirmPhrase="delete-me"
          confirmPhraseLabel="カスタムラベル"
        />,
      );

      expect(screen.getByText("カスタムラベル")).toBeInTheDocument();
    });
  });

  it("children を表示できる / renders children content", () => {
    render(
      <ConfirmActionDialog {...defaultProps}>
        <p data-testid="custom-content">影響範囲の説明</p>
      </ConfirmActionDialog>,
    );

    expect(screen.getByTestId("custom-content")).toHaveTextContent("影響範囲の説明");
  });

  it("背景クリック（onOpenChange）でダイアログが閉じる / calls onOpenChange when backdrop is clicked", async () => {
    const onOpenChange = vi.fn();
    render(<ConfirmActionDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await userEvent.click(screen.getByTestId("backdrop"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
