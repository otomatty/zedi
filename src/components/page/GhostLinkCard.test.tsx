import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GhostLinkCard } from "./GhostLinkCard";

describe("GhostLinkCard", () => {
  it("should render the ghost link title", () => {
    render(<GhostLinkCard title="New Page" onClick={() => {}} />);

    expect(screen.getByText("New Page")).toBeInTheDocument();
  });

  it("should show creation prompt", () => {
    render(<GhostLinkCard title="Test" onClick={() => {}} />);

    expect(screen.getByText("クリックしてページを作成")).toBeInTheDocument();
  });

  it("should call onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    
    render(<GhostLinkCard title="New Page" onClick={onClick} />);
    
    await user.click(screen.getByText("New Page"));
    
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should have dashed border style", () => {
    render(<GhostLinkCard title="Test" onClick={() => {}} />);
    
    // The card should have border-dashed class
    const card = screen.getByText("Test").closest('[class*="border-dashed"]');
    expect(card).toBeInTheDocument();
  });
});
