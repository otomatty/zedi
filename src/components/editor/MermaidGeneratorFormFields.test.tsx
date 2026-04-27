import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { MermaidGeneratorFormFields } from "./MermaidGeneratorFormFields";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("MermaidGeneratorFormFields", () => {
  beforeEach(() => {
    void i18n.changeLanguage("ja");
  });

  it("renders selected text and diagram type options", () => {
    renderWithI18n(
      <MermaidGeneratorFormFields
        selectedText="sample text"
        selectedTypes={["flowchart"]}
        onTypeToggle={vi.fn()}
        status="idle"
        error={null}
        onGenerate={vi.fn()}
      />,
    );

    expect(screen.getByText("選択されたテキスト")).toBeInTheDocument();
    expect(screen.getByText("sample text")).toBeInTheDocument();
    expect(screen.getByText("ダイアグラムタイプを選択（複数可）")).toBeInTheDocument();
    expect(screen.getByText("フローチャート")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ダイアグラムを生成" })).toBeInTheDocument();
  });

  it("disables generate button when no type selected", () => {
    renderWithI18n(
      <MermaidGeneratorFormFields
        selectedText="text"
        selectedTypes={[]}
        onTypeToggle={vi.fn()}
        status="idle"
        error={null}
        onGenerate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "ダイアグラムを生成" })).toBeDisabled();
  });

  it("calls onGenerate when ダイアグラムを生成 is clicked", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    renderWithI18n(
      <MermaidGeneratorFormFields
        selectedText="text"
        selectedTypes={["flowchart"]}
        onTypeToggle={vi.fn()}
        status="idle"
        error={null}
        onGenerate={onGenerate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ダイアグラムを生成" }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows generating state when status is generating", () => {
    renderWithI18n(
      <MermaidGeneratorFormFields
        selectedText="text"
        selectedTypes={["flowchart"]}
        onTypeToggle={vi.fn()}
        status="generating"
        error={null}
        onGenerate={vi.fn()}
      />,
    );

    expect(screen.getByText("生成中...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ダイアグラムを生成" })).not.toBeInTheDocument();
  });

  it("shows error and 再試行 button when status is error", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    renderWithI18n(
      <MermaidGeneratorFormFields
        selectedText="text"
        selectedTypes={["flowchart"]}
        onTypeToggle={vi.fn()}
        status="error"
        error={new Error("API error")}
        onGenerate={onGenerate}
      />,
    );

    expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
    expect(screen.getByText("API error")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("calls onTypeToggle when a diagram type is clicked", async () => {
    const user = userEvent.setup();
    const onTypeToggle = vi.fn();
    renderWithI18n(
      <MermaidGeneratorFormFields
        selectedText="text"
        selectedTypes={[]}
        onTypeToggle={onTypeToggle}
        status="idle"
        error={null}
        onGenerate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /フローチャート/ }));

    expect(onTypeToggle).toHaveBeenCalledWith("flowchart");
  });
});
