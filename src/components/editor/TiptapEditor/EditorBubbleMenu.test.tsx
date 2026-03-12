import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import type { Editor } from "@tiptap/core";

let shouldShowArgs: {
  state: { selection: { empty: boolean } };
  editor: {
    isActive: (name: string) => boolean;
    view?: { hasFocus?: () => boolean };
    isEditable?: boolean;
  };
} = {
  state: { selection: { empty: false } },
  editor: {
    isActive: () => false,
    view: { hasFocus: () => true },
    isEditable: true,
  },
};

vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({
    children,
    shouldShow,
  }: {
    children: React.ReactNode;
    shouldShow: (opts: {
      state: { selection: { empty: boolean } };
      editor: {
        isActive: (name: string) => boolean;
        view?: { hasFocus?: () => boolean };
        isEditable?: boolean;
      };
    }) => boolean;
  }) => {
    const show = shouldShow(shouldShowArgs);
    if (!show) return null;
    return <div data-testid="bubble-menu">{children}</div>;
  },
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useWikiLinkExistsChecker: () =>
    ({
      checkExistence: vi.fn().mockResolvedValue({
        pageTitles: new Set(),
        referencedTitles: new Set(),
      }),
    }) as unknown,
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

  it("shows menu when selection is empty but cursor is on wikiLink", () => {
    shouldShowArgs = {
      state: { selection: { empty: true } },
      editor: {
        isActive: (name: string) => name === "wikiLink",
        view: { hasFocus: () => true },
        isEditable: true,
      },
    };
    const { getByTestId } = render(<EditorBubbleMenu editor={mockEditor} />);
    expect(getByTestId("bubble-menu")).toBeInTheDocument();
  });

  it("hides menu when in codeBlock", () => {
    shouldShowArgs = {
      state: { selection: { empty: false } },
      editor: {
        isActive: (name: string) => name === "codeBlock",
        view: { hasFocus: () => true },
        isEditable: true,
      },
    };
    const { queryByTestId } = render(<EditorBubbleMenu editor={mockEditor} />);
    expect(queryByTestId("bubble-menu")).not.toBeInTheDocument();
  });

  it("hides menu when selection is empty and not on wikiLink", () => {
    shouldShowArgs = {
      state: { selection: { empty: true } },
      editor: {
        isActive: () => false,
        view: { hasFocus: () => true },
        isEditable: true,
      },
    };
    const { queryByTestId } = render(<EditorBubbleMenu editor={mockEditor} />);
    expect(queryByTestId("bubble-menu")).not.toBeInTheDocument();
  });

  it("hides menu when editor has no focus", () => {
    shouldShowArgs = {
      state: { selection: { empty: false } },
      editor: {
        isActive: () => false,
        view: { hasFocus: () => false },
        isEditable: true,
      },
    };
    const { queryByTestId } = render(<EditorBubbleMenu editor={mockEditor} />);
    expect(queryByTestId("bubble-menu")).not.toBeInTheDocument();
  });

  it("hides menu when editor is not editable", () => {
    shouldShowArgs = {
      state: { selection: { empty: false } },
      editor: {
        isActive: () => false,
        view: { hasFocus: () => true },
        isEditable: false,
      },
    };
    const { queryByTestId } = render(<EditorBubbleMenu editor={mockEditor} />);
    expect(queryByTestId("bubble-menu")).not.toBeInTheDocument();
  });
});
