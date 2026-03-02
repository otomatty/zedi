/* eslint-disable @typescript-eslint/no-explicit-any, complexity */
/**
 * Step 2: Transform exported Turso data for Railway PostgreSQL.
 *
 * - Maps Clerk user IDs → Better Auth user IDs
 * - Converts Unix ms timestamps → ISO strings
 * - Converts Tiptap JSON → Y.Doc (base64-encoded state)
 * - Extracts content_text for full-text search
 *
 * Usage:
 *   npx tsx scripts/migration/turso-to-railway/02-transform.ts
 */

// DOM polyfill for ProseMirror/Tiptap schema creation
import { Window } from "happy-dom";
const win = new Window();
for (const key of ["window", "document", "Node", "HTMLElement", "DOMParser"] as const) {
  if (!(key in globalThis) || !(globalThis as any)[key]) {
    Object.defineProperty(globalThis, key, {
      value: (win as any)[key],
      writable: true,
      configurable: true,
    });
  }
}
try {
  Object.defineProperty(globalThis, "navigator", {
    value: win.navigator,
    writable: true,
    configurable: true,
  });
} catch {
  // navigator may already exist as a getter in some Node versions
}

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import * as Y from "yjs";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Highlight } from "@tiptap/extension-highlight";
import { Underline } from "@tiptap/extension-underline";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");

// Clerk user ID → Better Auth user ID (Railway PostgreSQL)
const USER_ID_MAP: Record<string, string> = {
  user_37jAIdMFr4gzT466LyJEhpchQMa: "tODf6BtiKKx5fQJeuUUMz0q2JMOjmAjl",
};

// Y.Doc fragment name used by Hocuspocus
const YDOC_FRAGMENT = "default";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nanoidToUuid(id: string): string {
  if (UUID_REGEX.test(id)) return id;
  const hash = createHash("sha256").update(id).digest("hex");
  const v = "4";
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    v + hash.slice(13, 16),
    variant + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

function extractTextFromTiptap(node: any): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content
    .map((child: any) => {
      const text = extractTextFromTiptap(child);
      const isBlock = [
        "paragraph",
        "heading",
        "blockquote",
        "codeBlock",
        "listItem",
        "taskItem",
      ].includes(child.type);
      return isBlock ? text + "\n" : text;
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSchema() {
  return getSchema([
    StarterKit.configure({ codeBlock: true }),
    Link,
    TaskList,
    TaskItem,
    Highlight,
    Underline,
    Table,
    TableRow,
    TableCell,
    TableHeader,
    TextStyle,
    Color,
    Image,
  ]);
}

function tiptapJsonToYDocBase64(schema: any, tiptapJson: any): { base64: string; error?: string } {
  try {
    const doc = prosemirrorJSONToYDoc(schema, tiptapJson, YDOC_FRAGMENT);
    const state = Y.encodeStateAsUpdate(doc);
    return { base64: Buffer.from(state).toString("base64") };
  } catch (e: any) {
    return { base64: "", error: e.message };
  }
}

function msToIso(ms: number | bigint): string {
  return new Date(Number(ms)).toISOString();
}

async function main() {
  const inputPath = join(OUTPUT_DIR, "01-turso-export.json");
  if (!existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}\nRun 01-export-turso.ts first.`);
    process.exit(1);
  }

  console.log("Reading export...");
  const raw = JSON.parse(readFileSync(inputPath, "utf-8"));
  const pages: any[] = raw.pages;
  const links: any[] = raw.links;
  const sourceUserId: string = raw.sourceUserId;

  const targetUserId = USER_ID_MAP[sourceUserId];
  if (!targetUserId) {
    console.error(`No mapping for user: ${sourceUserId}`);
    process.exit(1);
  }

  console.log(`Transforming ${pages.length} pages...`);
  console.log(`  User mapping: ${sourceUserId} → ${targetUserId}`);

  // Build page ID mapping (nanoid → UUID)
  const idMap = new Map<string, string>();
  let convertedIds = 0;
  for (const p of pages) {
    const newId = nanoidToUuid(p.id);
    if (newId !== p.id) convertedIds++;
    idMap.set(p.id, newId);
  }
  console.log(
    `  ID conversions: ${convertedIds} nanoid → UUID (${pages.length - convertedIds} already UUID)`,
  );

  const schema = buildSchema();

  const transformedPages: any[] = [];
  const pageContents: any[] = [];
  const errors: any[] = [];
  let ydocSuccessCount = 0;

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (i > 0 && i % 200 === 0) console.log(`  Processing page ${i}/${pages.length}...`);

    const pageId = idMap.get(p.id) ?? p.id;
    const createdAt = msToIso(p.created_at);
    const updatedAt = msToIso(p.updated_at);

    let contentText: string | null = null;
    let ydocBase64: string | null = null;
    let contentPreview = p.content_preview || null;

    if (p.content && p.content !== '{"type":"doc","content":[]}') {
      try {
        const tiptapJson = JSON.parse(p.content);
        contentText = extractTextFromTiptap(tiptapJson);
        if (!contentPreview && contentText) {
          contentPreview = contentText.substring(0, 200);
        }

        const result = tiptapJsonToYDocBase64(schema, tiptapJson);
        if (result.error) {
          errors.push({ pageId: p.id, title: p.title, error: result.error });
          // Fallback: create Y.Doc with just text
          const fallbackDoc = new Y.Doc();
          const fragment = fallbackDoc.getXmlFragment(YDOC_FRAGMENT);
          const textEl = new Y.XmlText(contentText || "");
          const para = new Y.XmlElement("paragraph");
          para.insert(0, [textEl]);
          fragment.insert(0, [para]);
          ydocBase64 = Buffer.from(Y.encodeStateAsUpdate(fallbackDoc)).toString("base64");
        } else {
          ydocBase64 = result.base64;
          ydocSuccessCount++;
        }
      } catch (parseErr: any) {
        errors.push({ pageId: p.id, title: p.title, error: `JSON parse: ${parseErr.message}` });
      }
    } else {
      // Empty content → empty Y.Doc
      const emptyDoc = new Y.Doc();
      emptyDoc.getXmlFragment(YDOC_FRAGMENT);
      ydocBase64 = Buffer.from(Y.encodeStateAsUpdate(emptyDoc)).toString("base64");
      ydocSuccessCount++;
    }

    transformedPages.push({
      id: pageId,
      owner_id: targetUserId,
      source_page_id: null,
      title: p.title || null,
      content_preview: contentPreview,
      thumbnail_url: p.thumbnail_url || null,
      source_url: p.source_url || null,
      created_at: createdAt,
      updated_at: updatedAt,
      is_deleted: false,
    });

    if (ydocBase64) {
      pageContents.push({
        page_id: pageId,
        ydoc_state_base64: ydocBase64,
        version: 1,
        content_text: contentText,
        updated_at: updatedAt,
      });
    }
  }

  const transformedLinks = links.map((l: any) => ({
    source_id: idMap.get(l.source_id) ?? nanoidToUuid(l.source_id),
    target_id: idMap.get(l.target_id) ?? nanoidToUuid(l.target_id),
    created_at: msToIso(l.created_at),
  }));

  console.log(`\nTransform complete:`);
  console.log(`  Pages: ${transformedPages.length}`);
  console.log(
    `  Page contents (Y.Doc): ${pageContents.length} (${ydocSuccessCount} full, ${errors.length} fallback/error)`,
  );
  console.log(`  Links: ${transformedLinks.length}`);

  if (errors.length > 0) {
    console.log(`\n  Conversion errors (${errors.length}):`);
    errors.slice(0, 10).forEach((e) => {
      console.log(`    - ${e.title}: ${e.error}`);
    });
    if (errors.length > 10) console.log(`    ... and ${errors.length - 10} more`);
  }

  // Save ID mapping for reference
  const idMappings = Array.from(idMap.entries())
    .filter(([old, nw]) => old !== nw)
    .map(([oldId, newId]) => ({ oldId, newId }));

  const output = {
    transformedAt: new Date().toISOString(),
    sourceUserId,
    targetUserId,
    stats: {
      pages: transformedPages.length,
      pageContents: pageContents.length,
      links: transformedLinks.length,
      ydocSuccess: ydocSuccessCount,
      ydocErrors: errors.length,
      idsConverted: convertedIds,
    },
    idMappings,
    errors,
    pages: transformedPages,
    pageContents,
    links: transformedLinks,
  };

  const outputPath = join(OUTPUT_DIR, "02-transformed.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${outputPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
