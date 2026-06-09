/**
 * AIChatViewTabs: segment control for chat vs branch view.
 * AIChatViewTabs: チャット/ブランチビューのセグメントコントロール。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatViewTabs } from "./AIChatViewTabs";

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: vi.fn(() => true),
}));

const platformMod = () =>
  import("@/lib/platform") as Promise<{ isTauriDesktop: ReturnType<typeof vi.fn> }>;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

describe("AIChatViewTabs", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(true);
  });

  it("renders Chat, Branch, and Workflow tabs on desktop", () => {
    const onTabChange = vi.fn();
    render(<AIChatViewTabs activeTab="chat" onTabChange={onTabChange} />);
    expect(screen.getByRole("tab", { name: "aiChat.viewTabs.chat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "aiChat.viewTabs.branch" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "aiChat.viewTabs.workflow" })).toBeInTheDocument();
  });

  it("hides Workflow tab in non-desktop (web) environment", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(false);
    render(<AIChatViewTabs activeTab="chat" onTabChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "aiChat.viewTabs.chat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "aiChat.viewTabs.branch" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "aiChat.viewTabs.workflow" })).not.toBeInTheDocument();
  });

  it("Branch tab is always enabled", () => {
    render(<AIChatViewTabs activeTab="chat" onTabChange={vi.fn()} />);
    const branchTab = screen.getByRole("tab", { name: "aiChat.viewTabs.branch" });
    expect(branchTab).not.toBeDisabled();
  });

  it("calls onTabChange with branch when Branch tab is clicked", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<AIChatViewTabs activeTab="chat" onTabChange={onTabChange} />);
    await user.click(screen.getByRole("tab", { name: "aiChat.viewTabs.branch" }));
    expect(onTabChange).toHaveBeenCalledWith("branch");
  });

  it("calls onTabChange with chat when Chat tab is clicked", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<AIChatViewTabs activeTab="branch" onTabChange={onTabChange} />);
    await user.click(screen.getByRole("tab", { name: "aiChat.viewTabs.chat" }));
    expect(onTabChange).toHaveBeenCalledWith("chat");
  });

  it("calls onTabChange with workflow when Workflow tab is clicked", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<AIChatViewTabs activeTab="chat" onTabChange={onTabChange} />);
    await user.click(screen.getByRole("tab", { name: "aiChat.viewTabs.workflow" }));
    expect(onTabChange).toHaveBeenCalledWith("workflow");
  });
});
