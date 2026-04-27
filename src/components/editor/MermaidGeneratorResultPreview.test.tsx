import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { MermaidGeneratorResultPreview } from "./MermaidGeneratorResultPreview";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("MermaidGeneratorResultPreview", () => {
  beforeEach(() => {
    void i18n.changeLanguage("ja");
  });

  it("renders code and preview section", () => {
    renderWithI18n(
      <MermaidGeneratorResultPreview
        code="flowchart TD\n  A --> B"
        previewSvg="<svg></svg>"
        previewError={null}
      />,
    );

    expect(screen.getByText("生成されたコード")).toBeInTheDocument();
    const pre = document.querySelector("pre");
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toContain("flowchart TD");
    expect(pre?.textContent).toContain("A --> B");
    expect(screen.getByText("プレビュー")).toBeInTheDocument();
  });

  it("shows preview error when previewError is set", () => {
    renderWithI18n(
      <MermaidGeneratorResultPreview
        code="flowchart TD"
        previewSvg=""
        previewError="Parse error"
      />,
    );

    expect(screen.getByText("Parse error")).toBeInTheDocument();
  });

  it("shows loading message when no previewSvg and no previewError", () => {
    renderWithI18n(
      <MermaidGeneratorResultPreview code="flowchart TD" previewSvg="" previewError={null} />,
    );

    expect(screen.getByText("プレビューを読み込み中...")).toBeInTheDocument();
  });

  it("renders SVG when previewSvg is provided", () => {
    const svg = '<svg data-testid="mermaid-svg"><circle /></svg>';
    renderWithI18n(
      <MermaidGeneratorResultPreview code="flowchart TD" previewSvg={svg} previewError={null} />,
    );

    const wrapper = screen.getByTestId("preview-container");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.innerHTML).toContain("<svg");
  });
});
