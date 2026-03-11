import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorBubbleMenuToolbar } from "./EditorBubbleMenuToolbar";
import type { useEditorBubbleMenu } from "./useEditorBubbleMenu";

type EditorBubbleMenuState = ReturnType<typeof useEditorBubbleMenu>;

function createMockState(overrides?: Partial<EditorBubbleMenuState>): EditorBubbleMenuState {
  return {
    showColorPicker: false,
    setShowColorPicker: vi.fn(),
    setColor: vi.fn(),
    hasTable: true,
    hasTaskList: true,
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    toggleStrike: vi.fn(),
    toggleCode: vi.fn(),
    toggleHighlight: vi.fn(),
    toggleBulletList: vi.fn(),
    toggleOrderedList: vi.fn(),
    toggleTaskList: vi.fn(),
    insertTable: vi.fn(),
    isWikiLinkSelection: false,
    convertToWikiLink: vi.fn(),
    unsetWikiLink: vi.fn(),
    isConverting: false,
    ...overrides,
  };
}

const mockEditor = {
  isActive: vi.fn((_name: string) => false),
} as unknown as Parameters<typeof EditorBubbleMenuToolbar>[0]["editor"];

describe("EditorBubbleMenuToolbar", () => {
  it("renders formatting buttons with aria-labels", () => {
    const state = createMockState();
    render(<EditorBubbleMenuToolbar editor={mockEditor} state={state} />);

    expect(screen.getByRole("button", { name: "太字" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "イタリック" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WikiLinkにする" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "箇条書き" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字色" })).toBeInTheDocument();
  });

  it("shows WikiLink解除 button when isWikiLinkSelection is true", () => {
    const state = createMockState({ isWikiLinkSelection: true });
    render(<EditorBubbleMenuToolbar editor={mockEditor} state={state} />);

    expect(screen.getByRole("button", { name: "WikiLinkを解除" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "WikiLinkにする" })).not.toBeInTheDocument();
  });

  it("hides task list button when hasTaskList is false", () => {
    const state = createMockState({ hasTaskList: false });
    render(<EditorBubbleMenuToolbar editor={mockEditor} state={state} />);

    expect(screen.queryByRole("button", { name: "タスクリスト" })).not.toBeInTheDocument();
  });

  it("hides table button when hasTable is false", () => {
    const state = createMockState({ hasTable: false });
    render(<EditorBubbleMenuToolbar editor={mockEditor} state={state} />);

    expect(screen.queryByRole("button", { name: "テーブル" })).not.toBeInTheDocument();
  });
});
