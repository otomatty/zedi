// @vitest-environment happy-dom
import type { Editor } from "@tiptap/core";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { createEditor } from "./createEditor";

// Every Yjs relative position the binding creates for a text caret goes through this function,
// so counting its calls tells how often the selection is converted.
vi.mock("yjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("yjs")>();
  return {
    ...actual,
    createRelativePositionFromTypeIndex: vi.fn(actual.createRelativePositionFromTypeIndex),
  };
});

const conversions = vi.mocked(Y.createRelativePositionFromTypeIndex);
const editors: Editor[] = [];

function createCollabEditor(doc: Y.Doc, paragraphs: number): Editor {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = createEditor({
    element,
    collaboration: {
      doc,
      provider: { awareness: new Awareness(doc) },
      user: { name: "a", color: "#000000" },
      carets: "off",
    },
    searchTargets: async () => [],
  });
  editors.push(editor);
  if (paragraphs > 0) {
    editor.commands.setContent(
      Array.from({ length: paragraphs }, (_, i) => `<p>Paragraph ${i}</p>`).join(""),
    );
  }
  return editor;
}

/** Links two documents the way a provider does: updates from the peer carry a remote origin. */
function connect(a: Y.Doc, b: Y.Doc): void {
  a.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote") Y.applyUpdate(b, update, "remote");
  });
  b.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote") Y.applyUpdate(a, update, "remote");
  });
}

const undoManager = (editor: Editor): Y.UndoManager => {
  const state = yUndoPluginKey.getState(editor.state) as { undoManager: Y.UndoManager } | undefined;
  if (!state) throw new Error("the editor has no Yjs undo plugin");
  return state.undoManager;
};

/** What a pause in typing does: the next change starts a new undo step. */
const startNewUndoStep = (editor: Editor) => undoManager(editor).stopCapturing();

const type = (editor: Editor, text: string) => {
  for (const char of text) editor.view.dispatch(editor.state.tr.insertText(char));
};

/** Text on both sides of the caret, used to check the caret stayed on the same characters. */
const aroundCaret = (editor: Editor) => {
  const { from } = editor.state.selection;
  const $pos = editor.state.doc.resolve(from);
  const text = $pos.parent.textContent;
  return { before: text.slice(0, $pos.parentOffset), after: text.slice($pos.parentOffset) };
};

/** Document position right after `needle` inside the paragraph whose text is `paragraph`. */
const positionAfter = (editor: Editor, paragraph: string, needle: string) => {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.isTextblock && node.textContent === paragraph) {
      found = pos + 1 + paragraph.indexOf(needle) + needle.length;
    }
    return found === -1;
  });
  if (found === -1) throw new Error(`paragraph not found: ${paragraph}`);
  return found;
};

describe("collaborative editor selection", () => {
  afterEach(() => {
    while (editors.length > 0) editors.pop()?.destroy();
    document.body.replaceChildren();
  });

  it("keeps the caret on the same characters when a peer inserts text before it", () => {
    const local = new Y.Doc();
    const peer = new Y.Doc();
    connect(local, peer);
    const editor = createCollabEditor(local, 5);
    editor.commands.setTextSelection(positionAfter(editor, "Paragraph 3", "Para"));

    const fragment = peer.getXmlFragment("default");
    const first = fragment.get(0) as Y.XmlElement;
    (first.get(0) as Y.XmlText).insert(0, "Remote edit. ");
    const third = fragment.get(3) as Y.XmlElement;
    (third.get(0) as Y.XmlText).insert(0, "Peer ");

    expect(aroundCaret(editor)).toEqual({ before: "Peer Para", after: "graph 3" });
  });

  it("keeps the caret on the same characters when a peer edits while the user types", () => {
    const local = new Y.Doc();
    const peer = new Y.Doc();
    connect(local, peer);
    const editor = createCollabEditor(local, 5);
    editor.commands.setTextSelection(positionAfter(editor, "Paragraph 2", "Paragraph"));
    type(editor, " two");

    const second = peer.getXmlFragment("default").get(2) as Y.XmlElement;
    (second.get(0) as Y.XmlText).insert(0, ">> ");
    type(editor, "!");

    expect(aroundCaret(editor)).toEqual({ before: ">> Paragraph two!", after: " 2" });
  });

  it("keeps the caret when an editor change and a direct Yjs edit share one transaction", () => {
    const doc = new Y.Doc();
    const editor = createCollabEditor(doc, 5);
    editor.commands.setTextSelection(positionAfter(editor, "Paragraph 3", "Para"));

    doc.transact(() => {
      editor.commands.insertContent("a");
      const third = doc.getXmlFragment("default").get(3) as Y.XmlElement;
      (third.get(0) as Y.XmlText).insert(0, "Peer ");
    }, "app");

    expect(aroundCaret(editor)).toEqual({ before: "Peer Paraa", after: "graph 3" });
  });

  it("restores the caret from before each undo step", () => {
    const editor = createCollabEditor(new Y.Doc(), 5);
    editor.commands.setTextSelection(positionAfter(editor, "Paragraph 1", "Paragraph"));
    startNewUndoStep(editor);
    type(editor, " one");

    startNewUndoStep(editor);
    editor.commands.setTextSelection(positionAfter(editor, "Paragraph 4", "Para"));
    type(editor, "--");

    editor.commands.undo();
    expect(editor.getText({ blockSeparator: "|" })).toContain("Paragraph one 1");
    expect(editor.getText({ blockSeparator: "|" })).toContain("Paragraph 4");
    expect(aroundCaret(editor)).toEqual({ before: "Para", after: "graph 4" });

    editor.commands.undo();
    expect(editor.getText({ blockSeparator: "|" })).toContain("Paragraph 1");
    expect(aroundCaret(editor)).toEqual({ before: "Paragraph", after: " 1" });

    editor.commands.redo();
    expect(editor.getText({ blockSeparator: "|" })).toContain("Paragraph one 1");
  });

  it("does not convert the selection to Yjs positions on keystrokes within one undo step", () => {
    const editor = createCollabEditor(new Y.Doc(), 200);
    editor.commands.setTextSelection(positionAfter(editor, "Paragraph 199", "Paragraph"));
    // A slow test run must not split the keystrokes below into several undo steps.
    undoManager(editor).captureTimeout = 60_000;
    startNewUndoStep(editor);
    type(editor, "x");

    conversions.mockClear();
    type(editor, "yz and more text typed without a pause");

    expect(conversions).not.toHaveBeenCalled();
    expect(aroundCaret(editor)).toEqual({
      before: "Paragraphxyz and more text typed without a pause",
      after: " 199",
    });
  });
});
