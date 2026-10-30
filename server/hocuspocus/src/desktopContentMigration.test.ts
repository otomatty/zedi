/**
 * `migrateDesktopOnlyContent` のテスト。デスクトップ版の廃止で削除したノード・マークを、
 * クライアントが内容を消してしまう前に Web 版のスキーマへ変換することを確認する。
 *
 * Tests for `migrateDesktopOnlyContent`: nodes and marks removed with the desktop app
 * are converted to the web schema before a client (which deletes unknown types) sees them.
 */

import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { migrateDesktopOnlyContent } from "./desktopContentMigration.js";

type Delta = Array<{ insert: unknown; attributes?: Record<string, unknown> }>;

function element(
  name: string,
  attrs: Record<string, unknown> = {},
  children: Array<Y.XmlElement | Y.XmlText> = [],
): Y.XmlElement {
  const el = new Y.XmlElement(name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value as string);
  if (children.length > 0) el.insert(0, children);
  return el;
}

function text(segments: Array<{ insert: string; attributes?: Record<string, unknown> }>) {
  const t = new Y.XmlText();
  // A text not yet in a document reports length 0, so track the offset here; `{}` stops a
  // plain segment from inheriting the formatting on its left.
  let offset = 0;
  for (const s of segments) {
    t.insert(offset, s.insert, s.attributes ?? {});
    offset += s.insert.length;
  }
  return t;
}

function docWith(...blocks: Y.XmlElement[]): Y.Doc {
  const doc = new Y.Doc();
  doc.getXmlFragment("default").insert(0, blocks);
  return doc;
}

/** Block list as `[nodeName, attrs, text]` for compact assertions. */
function blocks(doc: Y.Doc) {
  return doc
    .getXmlFragment("default")
    .toArray()
    .map((node) => {
      const el = node as Y.XmlElement;
      const content = el
        .toArray()
        .map((child) => (child instanceof Y.XmlText ? plain(child) : ""))
        .join("");
      return [el.nodeName, el.getAttributes(), content];
    });
}

const plain = (t: Y.XmlText) =>
  (t.toDelta() as Delta).map((op) => (typeof op.insert === "string" ? op.insert : "")).join("");

describe("migrateDesktopOnlyContent", () => {
  it("turns an executable code block into a code block with the same code and language", () => {
    const doc = docWith(
      element("executableCodeBlock", { language: "python", runStatus: "idle" }, [
        text([{ insert: "print(1)" }]),
      ]),
    );

    const result = migrateDesktopOnlyContent(doc);

    expect(result).toEqual({ nodesConverted: 1, marksRemoved: 0 });
    expect(blocks(doc)).toEqual([["codeBlock", { language: "python" }, "print(1)"]]);
  });

  it("keeps the output of a cell that was run in a plain-text code block after it", () => {
    const doc = docWith(
      element(
        "executableCodeBlock",
        { language: "bash", runStatus: "error", stdout: "ok", stderr: "warn", errorMessage: "" },
        [text([{ insert: "ls" }])],
      ),
    );

    migrateDesktopOnlyContent(doc);

    expect(blocks(doc)).toEqual([
      ["codeBlock", { language: "bash" }, "ls"],
      ["codeBlock", { language: "text" }, "ok\nwarn"],
    ]);
  });

  it("turns an MCP resource into a paragraph naming it, followed by its fetched content", () => {
    const doc = docWith(
      element("mcpResource", {
        server: "github",
        resource: "repo://zedi/README.md",
        params: "",
        resolvedContent: "# Zedi",
        status: "resolved",
      }),
      element("mcpResource", { server: "fs", resource: "file:///a.txt", resolvedContent: "" }),
    );

    const result = migrateDesktopOnlyContent(doc);

    expect(result.nodesConverted).toBe(2);
    expect(blocks(doc)).toEqual([
      ["paragraph", {}, "MCP: github repo://zedi/README.md"],
      ["codeBlock", { language: "text" }, "# Zedi"],
      ["paragraph", {}, "MCP: fs file:///a.txt"],
    ]);
  });

  it("removes file reference marks but keeps the text and the other marks", () => {
    const t = text([
      { insert: "see " },
      { insert: "src/a.ts", attributes: { fileReference: { path: "src/a.ts" }, bold: true } },
      { insert: " and " },
      { insert: "b.md", attributes: { "fileReference--AbCd1234": { path: "b.md" } } },
    ]);
    const doc = docWith(element("paragraph", {}, [t]));

    const result = migrateDesktopOnlyContent(doc);

    expect(result).toEqual({ nodesConverted: 0, marksRemoved: 2 });
    expect(plain(t)).toBe("see src/a.ts and b.md");
    const marked = (t.toDelta() as Delta).filter((op) => op.attributes);
    expect(marked).toEqual([{ insert: "src/a.ts", attributes: { bold: true } }]);
  });

  it("converts content nested in lists and quotes", () => {
    const doc = docWith(
      element("blockquote", {}, [
        element("executableCodeBlock", { language: "bash" }, [text([{ insert: "pwd" }])]),
      ]),
      element("bulletList", {}, [
        element("listItem", {}, [
          element("paragraph", {}, [
            text([{ insert: "x", attributes: { fileReference: { path: "x" } } }]),
          ]),
        ]),
      ]),
    );

    const result = migrateDesktopOnlyContent(doc);

    expect(result).toEqual({ nodesConverted: 1, marksRemoved: 1 });
    const quote = doc.getXmlFragment("default").get(0) as Y.XmlElement;
    expect((quote.get(0) as Y.XmlElement).nodeName).toBe("codeBlock");
  });

  it("leaves other content untouched and changes nothing on a second run", () => {
    const doc = docWith(
      element("paragraph", {}, [text([{ insert: "hello", attributes: { bold: true } }])]),
      element("codeBlock", { language: "ts" }, [text([{ insert: "const a = 1" }])]),
      element("executableCodeBlock", { language: "bash" }, [text([{ insert: "echo" }])]),
    );
    migrateDesktopOnlyContent(doc);
    const updates: Uint8Array[] = [];
    doc.on("update", (update: Uint8Array) => updates.push(update));

    const again = migrateDesktopOnlyContent(doc);

    expect(again).toEqual({ nodesConverted: 0, marksRemoved: 0 });
    expect(updates).toEqual([]);
    expect(blocks(doc)).toEqual([
      ["paragraph", {}, "hello"],
      ["codeBlock", { language: "ts" }, "const a = 1"],
      ["codeBlock", { language: "bash" }, "echo"],
    ]);
  });
});
