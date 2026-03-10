import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MermaidGeneratorNotConfiguredView } from "./MermaidGeneratorNotConfiguredView";

describe("MermaidGeneratorNotConfiguredView", () => {
  it("renders title and description", () => {
    render(
      <MermaidGeneratorNotConfiguredView
        open={true}
        onOpenChange={vi.fn()}
        onGoToSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /AI設定が必要です/ })).toBeInTheDocument();
    expect(
      screen.getByText(/Mermaidダイアグラムを生成するには、AIの設定が必要です。/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/設定画面でOpenAI、Anthropic、またはGoogleのAPIキーを設定してください。/),
    ).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when キャンセル is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <MermaidGeneratorNotConfiguredView
        open={true}
        onOpenChange={onOpenChange}
        onGoToSettings={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onGoToSettings when 設定画面へ is clicked", async () => {
    const user = userEvent.setup();
    const onGoToSettings = vi.fn();
    render(
      <MermaidGeneratorNotConfiguredView
        open={true}
        onOpenChange={vi.fn()}
        onGoToSettings={onGoToSettings}
      />,
    );

    await user.click(screen.getByRole("button", { name: "設定画面へ" }));

    expect(onGoToSettings).toHaveBeenCalledTimes(1);
  });
});
