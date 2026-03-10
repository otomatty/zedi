import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MermaidGeneratorResultPreview } from "./MermaidGeneratorResultPreview";

describe("MermaidGeneratorResultPreview", () => {
  it("renders code and preview section", () => {
    render(
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
    render(
      <MermaidGeneratorResultPreview
        code="flowchart TD"
        previewSvg=""
        previewError="Parse error"
      />,
    );

    expect(screen.getByText("Parse error")).toBeInTheDocument();
  });

  it("shows loading message when no previewSvg and no previewError", () => {
    render(<MermaidGeneratorResultPreview code="flowchart TD" previewSvg="" previewError={null} />);

    expect(screen.getByText("プレビューを読み込み中...")).toBeInTheDocument();
  });

  it("renders SVG when previewSvg is provided", () => {
    const svg = '<svg data-testid="mermaid-svg"><circle /></svg>';
    const { container } = render(
      <MermaidGeneratorResultPreview code="flowchart TD" previewSvg={svg} previewError={null} />,
    );

    const wrapper = container.querySelector(".flex.justify-center");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper?.innerHTML).toContain("<svg");
  });
});
