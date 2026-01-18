import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DragOverlay } from "./DragOverlay";

describe("DragOverlay", () => {
  it("renders nothing when not visible", () => {
    const { container } = render(<DragOverlay isVisible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders overlay content when visible", () => {
    render(<DragOverlay isVisible={true} />);
    expect(screen.getByText("画像をドロップしてアップロード")).toBeInTheDocument();
  });
});
