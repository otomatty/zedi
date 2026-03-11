import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BubbleMenuButton } from "./BubbleMenuButton";

describe("BubbleMenuButton", () => {
  it("renders children and calls onClick when clicked", () => {
    const onClick = vi.fn();

    render(
      <BubbleMenuButton onClick={onClick} isActive={false}>
        <span data-testid="icon">Icon</span>
      </BubbleMenuButton>,
    );

    expect(screen.getByTestId("icon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies active styles when isActive is true", () => {
    const { container } = render(
      <BubbleMenuButton onClick={vi.fn()} isActive={true}>
        Bold
      </BubbleMenuButton>,
    );
    const button = container.querySelector("button");
    expect(button).toHaveClass("bg-accent", "text-accent-foreground");
  });

  it("applies inactive styles when isActive is false", () => {
    const { container } = render(
      <BubbleMenuButton onClick={vi.fn()} isActive={false}>
        Bold
      </BubbleMenuButton>,
    );
    const button = container.querySelector("button");
    expect(button).toHaveClass("text-muted-foreground");
  });

  it("forwards aria-label and title", () => {
    render(
      <BubbleMenuButton onClick={vi.fn()} isActive={false} aria-label="太字" title="太字 (Ctrl+B)">
        B
      </BubbleMenuButton>,
    );
    const button = screen.getByRole("button", { name: "太字" });
    expect(button).toHaveAttribute("title", "太字 (Ctrl+B)");
  });
});
