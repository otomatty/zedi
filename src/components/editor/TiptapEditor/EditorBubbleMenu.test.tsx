import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import type { Editor } from "@tiptap/core";

vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({
    children,
    shouldShow,
  }: {
    children: React.ReactNode;
    shouldShow: (opts: {
      state: { selection: { empty: boolean } };
      editor: { isActive: (name: string) => boolean };
    }) => boolean;
  }) => {
    const show = shouldShow({
      state: { selection: { empty: false } },
      editor: { isActive: (name: string) => name === "codeBlock" && false },
    });
    if (!show) return null;
    return <div data-testid="bubble-menu">{children}</div>;
  },
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useCheckGhostLinkReferenced: () => ({ checkReferenced: vi.fn().mockResolvedValue(false) }),
}));

const mockEditor = {
  isActive: vi.fn(() => false),
  extensionManager: { extensions: [] },
  state: { selection: { empty: false } },
  chain: vi.fn(() => ({
    focus: vi.fn().mockReturnThis(),
    run: vi.fn(),
  })),
} as unknown as Editor;

describe("EditorBubbleMenu", () => {
  it("renders BubbleMenu with toolbar when shouldShow is true", () => {
    const { getByTestId } = render(<EditorBubbleMenu editor={mockEditor} />);
    expect(getByTestId("bubble-menu")).toBeInTheDocument();
  });

  it("renders toolbar with WikiLink and formatting buttons", () => {
    const { getByRole } = render(<EditorBubbleMenu editor={mockEditor} />);
    expect(getByRole("button", { name: "太字" })).toBeInTheDocument();
    expect(getByRole("button", { name: "WikiLinkにする" })).toBeInTheDocument();
  });

  it("accepts optional pageId prop", () => {
    const { getByTestId } = render(<EditorBubbleMenu editor={mockEditor} pageId="page-1" />);
    expect(getByTestId("bubble-menu")).toBeInTheDocument();
  });
});
