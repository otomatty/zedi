import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleHelp } from "./CollapsibleHelp";

describe("CollapsibleHelp", () => {
  it("shows triggerLabel when closed and aria-expanded is false", () => {
    render(
      <CollapsibleHelp triggerLabel="詳細を見る" triggerLabelOpen="閉じる">
        <p>Help content</p>
      </CollapsibleHelp>,
    );
    const trigger = screen.getByRole("button", { name: "詳細を見る" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows triggerLabelOpen when open and aria-expanded is true", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleHelp triggerLabel="詳細を見る" triggerLabelOpen="閉じる">
        <p>Help content</p>
      </CollapsibleHelp>,
    );
    const trigger = screen.getByRole("button", { name: "詳細を見る" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Help content")).toBeInTheDocument();
  });

  it("respects defaultOpen", () => {
    render(
      <CollapsibleHelp triggerLabel="開く" triggerLabelOpen="閉じる" defaultOpen={true}>
        <p>Content</p>
      </CollapsibleHelp>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("toggles content when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleHelp triggerLabel="開く" triggerLabelOpen="閉じる">
        <p>Content</p>
      </CollapsibleHelp>,
    );
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "開く" }));
    expect(screen.getByText("Content")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });
});
