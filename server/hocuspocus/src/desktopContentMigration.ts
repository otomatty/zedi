/**
 * デスクトップ版（Tauri）の廃止で削除したノード・マークを、Web 版のスキーマで表せる形に
 * 変換する純粋なヘルパー。ドキュメントのロード時に適用する。
 *
 * y-tiptap はスキーマにないノードやマークに出会うと、その要素を共有ドキュメントから
 * 削除してしまう。そのため、削除したスキーマの内容がクライアントへ届く前に変換して、
 * 利用者の内容を失わないようにする。
 *
 * - `executableCodeBlock` → `codeBlock`（コードと言語を保持）。実行結果があれば
 *   直後に `codeBlock`（language: text）として残す。
 * - `mcpResource` → サーバー名とリソースを示す `paragraph`。取得済みの内容があれば
 *   直後に `codeBlock`（language: text）として残す。
 * - `fileReference` マーク → 削除（テキストは残す）。
 *
 * Pure helper, applied when a document is loaded, that converts nodes and marks removed
 * together with the desktop app (Tauri) into the web schema. y-tiptap deletes elements
 * whose node or mark type is missing from the schema, so the content must be converted
 * before it reaches a client, or users lose it.
 *
 * - `executableCodeBlock` → `codeBlock` (code and language kept); a run's output follows
 *   as a `codeBlock` with language `text`.
 * - `mcpResource` → a `paragraph` naming the server and resource; fetched content follows
 *   as a `codeBlock` with language `text`.
 * - `fileReference` mark → removed (the text stays).
 *
 * The client's snapshot preview (`src/lib/ydoc/yDocToTiptapJson.ts`) applies the same
 * rules to old snapshots; keep the two in step.
 */

import * as Y from "yjs";

/** What the migration changed. / 変換した件数。 */
export interface DesktopContentMigrationResult {
  nodesConverted: number;
  marksRemoved: number;
}

/** y-tiptap may store a mark under `name--<hash>` when marks of one type overlap. */
const FILE_REFERENCE_KEY = /^fileReference(--.+)?$/;

const attr = (el: Y.XmlElement, name: string): string => {
  const value = el.getAttribute(name) as unknown;
  return typeof value === "string" ? value : "";
};

const plainText = (el: Y.XmlElement): string =>
  el
    .toArray()
    .map((child) =>
      child instanceof Y.XmlText
        ? (child.toDelta() as Array<{ insert: unknown }>)
            .map((op) => (typeof op.insert === "string" ? op.insert : ""))
            .join("")
        : "",
    )
    .join("");

function block(name: string, attrs: Record<string, string>, content: string): Y.XmlElement {
  const el = new Y.XmlElement(name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (content) {
    const t = new Y.XmlText();
    t.insert(0, content);
    el.insert(0, [t]);
  }
  return el;
}

const outputBlock = (content: string) => block("codeBlock", { language: "text" }, content);

/** Elements that replace a removed node, or null when the node is kept. */
function replacementFor(el: Y.XmlElement): Y.XmlElement[] | null {
  if (el.nodeName === "executableCodeBlock") {
    const output = [attr(el, "stdout"), attr(el, "stderr"), attr(el, "errorMessage")]
      .filter((part) => part !== "")
      .join("\n");
    const code = block("codeBlock", { language: attr(el, "language") || "bash" }, plainText(el));
    return output ? [code, outputBlock(output)] : [code];
  }
  if (el.nodeName === "mcpResource") {
    const label = ["MCP:", attr(el, "server"), attr(el, "resource")].filter(Boolean).join(" ");
    const content = attr(el, "resolvedContent");
    const paragraph = block("paragraph", {}, label);
    return content ? [paragraph, outputBlock(content)] : [paragraph];
  }
  return null;
}

/** Removes `fileReference` formatting from a text; returns how many segments changed. */
function stripFileReferences(text: Y.XmlText): number {
  let removed = 0;
  let index = 0;
  for (const op of text.toDelta() as Array<{ insert: unknown; attributes?: object }>) {
    const length = typeof op.insert === "string" ? op.insert.length : 1;
    const keys = Object.keys(op.attributes ?? {}).filter((key) => FILE_REFERENCE_KEY.test(key));
    if (keys.length > 0) {
      text.format(index, length, Object.fromEntries(keys.map((key) => [key, null])));
      removed += 1;
    }
    index += length;
  }
  return removed;
}

function migrateChildren(
  parent: Y.XmlFragment | Y.XmlElement,
  result: DesktopContentMigrationResult,
): void {
  for (let i = 0; i < parent.length; i++) {
    const child = parent.get(i);
    if (child instanceof Y.XmlText) {
      result.marksRemoved += stripFileReferences(child);
      continue;
    }
    if (!(child instanceof Y.XmlElement)) continue;
    const replacement = replacementFor(child);
    if (replacement) {
      parent.delete(i, 1);
      parent.insert(i, replacement);
      i += replacement.length - 1;
      result.nodesConverted += 1;
      continue;
    }
    migrateChildren(child, result);
  }
}

/**
 * Converts desktop-only content in the `default` fragment, in one transaction.
 * Returns zero counts (and makes no update) when there is nothing to convert.
 * `default` フラグメント内のデスクトップ専用の内容を 1 回のトランザクションで変換する。
 */
export function migrateDesktopOnlyContent(doc: Y.Doc): DesktopContentMigrationResult {
  const result: DesktopContentMigrationResult = { nodesConverted: 0, marksRemoved: 0 };
  doc.transact(() => migrateChildren(doc.getXmlFragment("default"), result));
  return result;
}
