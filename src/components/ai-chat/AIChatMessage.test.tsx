import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessage } from "../../types/aiChat";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "aiChat.messages.loadingSkeleton" ? "Loading response" : key),
  }),
}));

import { AIChatMessage } from "./AIChatMessage";

describe("AIChatMessage", () => {
  it("shows text-style skeleton when assistant is streaming with no content yet", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "",
      isStreaming: true,
      timestamp: Date.now(),
    };

    render(<AIChatMessage message={message} />);

    expect(screen.getByTestId("ai-chat-message-skeleton")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading response")).toBeInTheDocument();
  });

  it("shows markdown when assistant has streaming content", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Hello",
      isStreaming: true,
      timestamp: Date.now(),
    };

    render(<AIChatMessage message={message} />);

    expect(screen.queryByTestId("ai-chat-message-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
