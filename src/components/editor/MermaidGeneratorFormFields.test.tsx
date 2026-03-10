import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MermaidGeneratorFormFields } from "./MermaidGeneratorFormFields";

describe("MermaidGeneratorFormFields", () => {
  it("renders selected text and diagram type options", () => {
    render(
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
    render(
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
    render(
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
    render(
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
    render(
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
    render(
      <MermaidGeneratorFormFields
        selectedText="text"
        selectedTypes={[]}
        onTypeToggle={onTypeToggle}
        status="idle"
        error={null}
        onGenerate={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("フローチャート"));

    expect(onTypeToggle).toHaveBeenCalledWith("flowchart");
  });
});
