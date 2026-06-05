import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserMessageContent } from "./AIChatUserMessageBubble";

describe("UserMessageContent", () => {
  it("renders plain text when there are no referenced pages", () => {
    const { container } = render(<UserMessageContent content="hello @World" />);
    // バッジ化されず、生テキストとして表示される。
    expect(container.textContent).toBe("hello @World");
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders @PageTitle as an inline badge when referenced", () => {
    render(
      <UserMessageContent
        content="see @Alpha and @Beta here"
        referencedPages={[
          { id: "a", title: "Alpha" },
          { id: "b", title: "Beta" },
        ]}
      />,
    );

    // バッジ化された参照ページが表示される。
    const alpha = screen.getByText("Alpha");
    const beta = screen.getByText("Beta");
    expect(alpha.tagName).toBe("SPAN");
    expect(beta.tagName).toBe("SPAN");
    // 周囲のプレーンテキストも保持される。
    expect(screen.getByText(/see/)).toBeInTheDocument();
    expect(screen.getByText(/and/)).toBeInTheDocument();
  });

  it("prefers the longest matching title for overlapping prefixes", () => {
    render(
      <UserMessageContent
        content="@AI Chat done"
        referencedPages={[
          { id: "1", title: "AI" },
          { id: "2", title: "AI Chat" },
        ]}
      />,
    );

    // 長いタイトル優先で "AI Chat" 全体が 1 つのバッジになる。
    expect(screen.getByText("AI Chat").tagName).toBe("SPAN");
    expect(screen.queryByText("AI", { exact: true })).toBeNull();
  });
});
