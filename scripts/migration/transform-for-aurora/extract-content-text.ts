/**
 * C2-4: テキスト抽出・content_text
 * C2-3 の page-contents-*.json を読み、各 Y.Doc から全文検索用テキストを抽出し、
 * page_contents に content_text を付与した JSON を出力する。
 *
 * 実行: bun run scripts/migration/transform-for-aurora/extract-content-text.ts [path/to/page-contents.json]
 * 入力省略時は output/ 内の最新 page-contents-*.json を使用。
 */

import { readFile, readdir, mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, "output");

type ProseMirrorNode = { type: string; text?: string; content?: ProseMirrorNode[] };

/** ProseMirror/Tiptap JSON からプレーンテキストを抽出（全文検索用） */
function extractTextFromNode(node: ProseMirrorNode): string {
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromNode).join("");
  }
  return "";
}

function extractTextFromDoc(doc: ProseMirrorNode): string {
  const raw = extractTextFromNode(doc);
  // 連続空白・改行を正規化し、前後トリム
  return raw.replace(/\s+/g, " ").trim();
}

async function findLatestPageContents(): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await readdir(outputDir);
  } catch (_) {
    return null;
  }
  const jsonFiles = files
    .filter((f) => f.startsWith("page-contents-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return jsonFiles.length ? join(outputDir, jsonFiles[0]) : null;
}

async function main() {
  const inputPath = process.argv[2] || (await findLatestPageContents());
  if (!inputPath) {
    console.error(
      "Usage: bun run scripts/migration/transform-for-aurora/extract-content-text.ts [path/to/page-contents.json]"
    );
    console.error("Or run after C2-3 (default: latest page-contents-*.json in output/)");
    process.exit(1);
  }

  const raw = await readFile(inputPath, "utf8");
  const data = JSON.parse(raw) as {
    page_contents: Array<{ page_id: string; ydoc_state_base64: string; version: number }>;
    [key: string]: unknown;
  };

  const pageContents = data.page_contents ?? [];
  const withText: Array<{
    page_id: string;
    ydoc_state_base64: string;
    version: number;
    content_text: string | null;
  }> = [];
  let errors = 0;

  for (const item of pageContents) {
    try {
      const update = Buffer.from(item.ydoc_state_base64, "base64");
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, update);
      const fragment = ydoc.getXmlFragment("default");
      const docJson = yXmlFragmentToProsemirrorJSON(fragment) as ProseMirrorNode;
      const contentText = extractTextFromDoc(docJson) || null;
      withText.push({
        page_id: item.page_id,
        ydoc_state_base64: item.ydoc_state_base64,
        version: item.version,
        content_text: contentText,
      });
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.warn(`Page ${item.page_id}: ${err instanceof Error ? err.message : String(err)}`);
      }
      withText.push({
        page_id: item.page_id,
        ydoc_state_base64: item.ydoc_state_base64,
        version: item.version,
        content_text: null,
      });
    }
  }

  const out = {
    ...data,
    transformed_at: new Date().toISOString(),
    source: inputPath,
    page_contents: withText,
    _meta: {
      ...(typeof data._meta === "object" && data._meta !== null ? data._meta : {}),
      content_text_extracted: withText.filter((x) => x.content_text != null && x.content_text !== "").length,
      errors,
    },
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(outputDir, `page-contents-with-text-${timestamp}.json`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");

  console.log("C2-4 extract-content-text done.");
  console.log("  page_contents:", withText.length);
  console.log("  with content_text:", withText.filter((x) => x.content_text != null && x.content_text !== "").length);
  if (errors > 0) console.log("  errors:", errors);
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
