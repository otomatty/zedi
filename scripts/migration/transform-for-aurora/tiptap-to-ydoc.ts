/**
 * C2-3: Tiptap JSON → Y.Doc 変換
 * C2-2 の aurora-transform-*.json を読み、各 page の content（Tiptap JSON）を Y.Doc に変換し、
 * page_contents 用の ydoc_state（base64）を生成する。
 *
 * 実行: bun run scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts [path/to/aurora-transform.json]
 * 入力省略時は output/ 内の最新 aurora-transform-*.json を使用。
 */

import { readFile, readdir, mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import * as Y from "yjs";
import { getSchema } from "@tiptap/core";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { Mark, Node } from "@tiptap/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, "output");

// 本番エディタにあるが migration ではスタブにするノード/マーク（fromJSON を通すため名前と属性のみ）
const WikiLinkStub = Mark.create({
  name: "wikiLink",
  addAttributes() {
    return { title: { default: null }, exists: { default: false } };
  },
});

const MermaidStub = Node.create({
  name: "mermaid",
  group: "block",
  content: "text*",
  addAttributes() {
    return { code: { default: "" } };
  },
});

const UnilinkStub = Mark.create({
  name: "unilink",
  addAttributes() {
    return { href: { default: null }, title: { default: null } };
  },
});

const PageLinkStub = Mark.create({
  name: "pageLink",
  addAttributes() {
    return { pageId: { default: null }, title: { default: null } };
  },
});

const PageLinkMarkStub = Mark.create({
  name: "pageLinkMark",
  addAttributes() {
    return { pageId: { default: null }, title: { default: null } };
  },
});

const extensions = [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false }),
  Image,
  Placeholder.configure({ placeholder: "" }),
  Typography,
  WikiLinkStub,
  UnilinkStub,
  PageLinkStub,
  PageLinkMarkStub,
  MermaidStub,
];

const schema = getSchema(extensions);

const EMPTY_DOC = { type: "doc", content: [] };

/** ProseMirror は空の text ノードを許容しないため、空文字を \u00A0 に置換 */
function sanitizeNode(node: unknown): unknown {
  if (node && typeof node === "object" && "type" in node) {
    const n = node as { type: string; text?: string; content?: unknown[]; marks?: unknown[] };
    if (n.type === "text") {
      const text = n.text ?? "";
      return { ...n, text: text === "" ? "\u00A0" : text };
    }
    if (Array.isArray(n.content)) {
      return { ...n, content: n.content.map(sanitizeNode) };
    }
  }
  return node;
}

function parseContent(content: string | null): { type: "doc"; content?: unknown[] } {
  if (content == null || String(content).trim() === "") return EMPTY_DOC;
  try {
    const parsed = JSON.parse(String(content)) as unknown;
    if (parsed && typeof parsed === "object" && "type" in parsed && (parsed as { type: string }).type === "doc") {
      return sanitizeNode(parsed) as { type: "doc"; content?: unknown[] };
    }
  } catch (_) {
    // ignore
  }
  return EMPTY_DOC;
}

function tiptapJsonToYDocStateBase64(content: string | null): string {
  const docJson = parseContent(content);
  const ydoc = prosemirrorJSONToYDoc(schema, docJson, "default");
  const update = Y.encodeStateAsUpdate(ydoc);
  return Buffer.from(update).toString("base64");
}

async function findLatestTransform(): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await readdir(outputDir);
  } catch (_) {
    return null;
  }
  const jsonFiles = files
    .filter((f) => f.startsWith("aurora-transform-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return jsonFiles.length ? join(outputDir, jsonFiles[0]) : null;
}

async function main() {
  const inputPath = process.argv[2] || (await findLatestTransform());
  if (!inputPath) {
    console.error("Usage: bun run scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts [path/to/aurora-transform.json]");
    console.error("Or run after C2-2 (default: latest aurora-transform-*.json in output/)");
    process.exit(1);
  }

  const raw = await readFile(inputPath, "utf8");
  const data = JSON.parse(raw) as {
    pages?: Array<{ id: string; content?: string | null }>;
    [key: string]: unknown;
  };

  const pages = data.pages ?? [];
  const pageContents: Array<{ page_id: string; ydoc_state_base64: string; version: number }> = [];
  let errors = 0;

  for (const page of pages) {
    try {
      const ydocBase64 = tiptapJsonToYDocStateBase64(page.content ?? null);
      pageContents.push({
        page_id: page.id,
        ydoc_state_base64: ydocBase64,
        version: 1,
      });
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.warn(`Page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const out = {
    transformed_at: new Date().toISOString(),
    source: inputPath,
    page_contents: pageContents,
    _meta: { total_pages: pages.length, converted: pageContents.length, errors },
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(outputDir, `page-contents-${timestamp}.json`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");

  console.log("C2-3 tiptap-to-ydoc done.");
  console.log("  page_contents:", pageContents.length);
  if (errors > 0) console.log("  errors:", errors);
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
