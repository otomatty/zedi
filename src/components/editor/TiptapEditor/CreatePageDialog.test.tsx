import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatePageDialog } from "./CreatePageDialog";

describe("CreatePageDialog", () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders nothing when open is false", () => {
    render(
      <CreatePageDialog
        open={false}
        pageTitle="Test Page"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("renders alertdialog with title and pageTitle in description when open", () => {
    render(
      <CreatePageDialog
        open={true}
        pageTitle="My New Page"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ページを作成しますか？" })).toBeInTheDocument();
    expect(
      screen.getByText(/「My New Page」というタイトルのページはまだ存在しません/),
    ).toBeInTheDocument();
  });

  it("calls onCancel when キャンセル button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CreatePageDialog open={true} pageTitle="Test" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm when 作成する button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CreatePageDialog open={true} pageTitle="Test" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: "作成する" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
