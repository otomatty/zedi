import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { MermaidGeneratorNotConfiguredView } from "./MermaidGeneratorNotConfiguredView";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("MermaidGeneratorNotConfiguredView", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("renders title and description", () => {
    renderWithI18n(
      <MermaidGeneratorNotConfiguredView
        open={true}
        onOpenChange={vi.fn()}
        onGoToSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /AI設定が必要/ })).toBeInTheDocument();
    expect(screen.getByText(/Mermaidダイアグラムを生成するには/)).toBeInTheDocument();
    expect(screen.getByText(/設定画面でOpenAI/)).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithI18n(
      <MermaidGeneratorNotConfiguredView
        open={true}
        onOpenChange={onOpenChange}
        onGoToSettings={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onGoToSettings when goToSettings is clicked", async () => {
    const user = userEvent.setup();
    const onGoToSettings = vi.fn();
    renderWithI18n(
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
