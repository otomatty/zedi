import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { HeadingLevelClamp } from "./headingLevelClampExtension";

/**
 * ロード直後、appendTransaction により h1 相当 (level:1) が h2 へ上書きされることを検証する
 * / Verifies legacy Tiptap JSON (heading level:1) becomes level:2 on load
 */
describe("HeadingLevelClamp", () => {
  const editors: Editor[] = [];
  afterEach(() => {
    for (const ed of editors) {
      ed.destroy();
    }
    editors.length = 0;
  });

  it("migrates stored heading level 1 to 2 for schema levels 2-5", async () => {
    const el = document.createElement("div");
    const editor = new Editor({
      element: el,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4, 5] },
        }),
        HeadingLevelClamp,
      ],
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Legacy" }] },
        ],
      },
    });
    editors.push(editor);
    await new Promise<void>((resolve) => {
      queueMicrotask(() => resolve());
    });
    const first = editor.state.doc.firstChild;
    expect(first?.type.name).toBe("heading");
    expect(first?.attrs.level).toBe(2);
  });
});
