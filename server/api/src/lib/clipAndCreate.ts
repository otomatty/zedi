/**
 * clip-and-create: URL → fetch → Readability → Tiptap JSON → Y.Doc → DB
 *
 * Server-side web clipping pipeline for Chrome extension.
 */
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { generateJSON } from "@tiptap/html";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { common, createLowlight } from "lowlight";
import * as Y from "yjs";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { pages, pageContents } from "../schema/index.js";
import type * as schema from "../schema/index.js";

const lowlight = createLowlight(common);
const YDOC_FRAGMENT = "default";

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
  }),
  Link.configure({ openOnClick: false }),
  CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
  Image,
];

function buildSchema() {
  return getSchema(extensions);
}

function extractOgImage(doc: Document): string | null {
  const meta =
    doc.querySelector('meta[property="og:image"]') || doc.querySelector('meta[name="og:image"]');
  return meta?.getAttribute("content") || null;
}

function resolveUrl(base: string, relative: string | null): string | null {
  if (!relative) return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function cleanupHtml(html: string, doc: Document): string {
  const div = doc.createElement("div");
  div.innerHTML = html;

  const unwanted = ["script", "style", "noscript", "iframe", "object", "embed", "form"];
  for (const sel of unwanted) {
    div.querySelectorAll(sel).forEach((el) => el.remove());
  }
  return div.innerHTML.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
}

function extractTextFromTiptap(node: { text?: string; content?: unknown[] } | null): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content
    .map((child: unknown) => extractTextFromTiptap(child as { text?: string; content?: unknown[] }))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 *
 */
export interface ClipAndCreateResult {
  page_id: string;
  title: string;
  thumbnail_url?: string | null;
}

/**
 *
 */
export interface ClipAndCreateInput {
  url: string;
  userId: string;
  db: NodePgDatabase<typeof schema>;
}

/**
 * Fetch HTML, extract content, create page and Y.Doc content.
 */
export async function clipAndCreate(input: ClipAndCreateInput): Promise<ClipAndCreateResult> {
  const { url, userId, db } = input;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "zedi-clip/1.0 (https://zedi.app)",
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    },
    redirect: "follow",
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const finalUrl = response.url;
  const dom = new JSDOM(html, { url: finalUrl });
  const document = dom.window.document;

  const reader = new Readability(document.cloneNode(true) as Document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Failed to extract article content");
  }

  const ogImage = extractOgImage(document);
  const thumbnailUrl = resolveUrl(finalUrl, ogImage);

  const cleanContent = cleanupHtml(article.content ?? "", document);

  const prevDocument = (globalThis as { document?: Document }).document;
  (globalThis as { document?: Document }).document = document;
  try {
    const mainJson = generateJSON(cleanContent, extensions) as {
      type: string;
      content?: Array<{ type: string; attrs?: Record<string, unknown> }>;
    };

    const baseContent = mainJson.content ?? [];

    const imageNode = thumbnailUrl
      ? {
          type: "image",
          attrs: {
            src: thumbnailUrl,
            alt: (article.title ?? "OGP thumbnail") as string,
          },
        }
      : null;

    const tiptapJson = {
      type: "doc",
      content: imageNode ? [imageNode, ...baseContent] : baseContent,
    };

    const schema = buildSchema();
    const ydoc = prosemirrorJSONToYDoc(schema, tiptapJson, YDOC_FRAGMENT);
    const ydocState = Y.encodeStateAsUpdate(ydoc);
    const ydocBase64 = Buffer.from(ydocState).toString("base64");

    const contentText = extractTextFromTiptap(tiptapJson).slice(0, 200);
    const title = article.title || "Untitled";

    const [page] = await db
      .insert(pages)
      .values({
        ownerId: userId,
        title,
        contentPreview: contentText || null,
        sourceUrl: finalUrl,
        thumbnailUrl: thumbnailUrl ?? null,
      })
      .returning({ id: pages.id });

    if (!page) throw new Error("Failed to create page");

    await db.insert(pageContents).values({
      pageId: page.id,
      ydocState: Buffer.from(ydocBase64, "base64"),
      version: 1,
      contentText: contentText || null,
    });

    return {
      page_id: page.id,
      title,
      thumbnail_url: thumbnailUrl ?? null,
    };
  } finally {
    (globalThis as { document?: Document }).document = prevDocument;
  }
}
