/**
 * AI chat conversation row: open and delete confirm call the delete hook.
 * AI 会話行: 開く・削除確認でフックが呼ばれる。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatConversationListRow } from "./AIChatConversationListRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: "en" },
  }),
}));

const deleteWithStoreSync = vi.fn();

vi.mock("@/hooks/useDeleteAIConversation", () => ({
  useDeleteAIConversation: () => deleteWithStoreSync,
}));

const baseConv = {
  id: "c1",
  title: "My chat",
  messages: [] as import("@/types/aiChat").ChatMessage[],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("AIChatConversationListRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onOpen when the page variant main button is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <AIChatConversationListRow
        conversation={baseConv}
        variant="page"
        isActive={false}
        onOpen={onOpen}
        dateLabel="1 min ago"
        titleLabel="My chat"
      />,
    );
    await user.click(screen.getByRole("button", { name: /My chat/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("calls delete hook when delete is confirmed in page variant", async () => {
    const user = userEvent.setup();
    render(
      <AIChatConversationListRow
        conversation={baseConv}
        variant="page"
        isActive
        onOpen={vi.fn()}
        dateLabel="1 min ago"
        titleLabel="My chat"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteWithStoreSync).toHaveBeenCalledWith("c1");
  });
});
