/**
 * SnapshotPreview コンポーネントのテスト
 * Tests for the SnapshotPreview component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import * as Y from "yjs";
import { SnapshotPreview } from "./SnapshotPreview";

// TipTap の useEditor は jsdom では完全に動作しないためモック
const mockSetContent = vi.fn();
vi.mock("@tiptap/react", () => ({
  useEditor: () => ({
    commands: { setContent: mockSetContent },
    destroy: vi.fn(),
  }),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{editor ? "editor-loaded" : "no-editor"}</div>
  ),
}));

vi.mock("../TiptapEditor/editorConfig", () => ({
  createSnapshotPreviewExtensions: () => [],
}));
vi.mock("@/lib/ydoc/yDocToTiptapJson", () => ({
  yXmlFragmentToTiptapJson: () => ({ type: "doc", content: [{ type: "paragraph" }] }),
}));

/**
 * 有効な Y.Doc state の base64 文字列を生成する
 * Generate a valid Y.Doc state as base64 string
 */
function createValidYdocBase64(): string {
  const doc = new Y.Doc();
  doc.transact(() => {
    const fragment = doc.getXmlFragment("default");
    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    t.insert(0, "Hello");
    p.push([t]);
    fragment.push([p]);
  });
  const state = Y.encodeStateAsUpdate(doc);
  return btoa(String.fromCharCode(...state));
}

describe("SnapshotPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("有効な ydocState でエディタをレンダリングする / renders editor with valid ydocState", () => {
    const base64 = createValidYdocBase64();
    render(<SnapshotPreview ydocState={base64} />);

    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    expect(screen.getByText("editor-loaded")).toBeInTheDocument();
  });

  it("className が渡される / passes className to wrapper", () => {
    const base64 = createValidYdocBase64();
    const { container } = render(<SnapshotPreview ydocState={base64} className="custom-class" />);

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("不正な ydocState でもクラッシュしない / does not crash with invalid ydocState", () => {
    render(<SnapshotPreview ydocState="invalid-base64!!!" />);

    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
  });
});
