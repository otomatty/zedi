/**
 * clip-and-create: URL → fetch → Readability → Tiptap JSON → Y.Doc → DB
 *
 * Server-side web clipping pipeline for Chrome extension.
 */
import { Mutex } from "async-mutex";
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
import { isClipUrlAllowed } from "./clipUrlPolicy.js";

const lowlight = createLowlight(common);
const YDOC_FRAGMENT = "default";
/** Serializes globalThis.document mutation so concurrent clipAndCreate calls do not race. */
const clipDocMutex = new Mutex();

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
    const resolved = new URL(relative, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.href;
  } catch {
    return null;
  }
}

async function fetchHtmlWithRedirects(
  url: string,
  controller: AbortController,
): Promise<{ html: string; finalUrl: string }> {
  const MAX_REDIRECTS = 5;
  let response!: Response;
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "zedi-clip/1.0 (https://zedi.app)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      const location = response.headers.get("Location");
      if (!location || hop === MAX_REDIRECTS) {
        throw new Error("Too many redirects or invalid Location");
      }

      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).href;
      } catch {
        throw new Error("Invalid redirect Location");
      }

      if (!isClipUrlAllowed(nextUrl)) {
        throw new Error("Redirect to disallowed URL");
      }
      currentUrl = nextUrl;
      continue;
    }
    break;
  }

  if (response.url !== currentUrl && !isClipUrlAllowed(response.url)) {
    throw new Error("Redirect to disallowed URL");
  }

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return { html, finalUrl: response.url };
}

function cleanupHtml(html: string, doc: Document): string {
  const div = doc.createElement("div");
  div.innerHTML = html;

  const unwanted = ["script", "style", "noscript", "iframe", "object", "embed", "form"];
  for (const sel of unwanted) {
    div.querySelectorAll(sel).forEach((el) => {
      el.remove();
    });
  }
  return div.innerHTML.trim();
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
 * クリップ作成結果。作成されたページの ID・タイトル・サムネイル URL。
 * Clip-and-create result: created page id, title, and optional thumbnail URL.
 *
 * @property page_id - 作成されたページの一意 ID。Created page unique ID.
 * @property title - ページタイトル。Page title.
 * @property thumbnail_url - サムネイル画像 URL（任意）。Optional thumbnail image URL.
 */
export interface ClipAndCreateResult {
  page_id: string;
  title: string;
  thumbnail_url?: string | null;
}

/**
 * クリップ作成の入力。URL・ユーザー ID・DB インスタンス。
 * Clip-and-create input: source URL, requesting user ID, and database instance.
 *
 * @property url - クリップするソース URL（http/https のみ許可）。Source URL to clip (http/https only).
 * @property userId - リクエストユーザー ID。Requesting user ID.
 * @property db - Drizzle NodePgDatabase インスタンス。Drizzle NodePgDatabase instance.
 */
export interface ClipAndCreateInput {
  url: string;
  userId: string;
  db: NodePgDatabase<typeof schema>;
}

/**
 * URL から HTML を取得し、Readability で本文を抽出して Tiptap JSON → Y.Doc 化し、DB にページを作成する。
 * Fetches HTML from URL, extracts content with Readability, converts to Tiptap JSON and Y.Doc, persists page to DB.
 *
 * @param input - クリップ対象 URL・ユーザー ID・DB。Source URL, userId, and db.
 * @returns 作成されたページの page_id, title, thumbnail_url。Created page metadata.
 * @throws URL が許可されていない、fetch 失敗、本文抽出失敗、DB エラー時に throw。Throws when URL disallowed, fetch fails, extraction fails, or DB error.
 */
export async function clipAndCreate(input: ClipAndCreateInput): Promise<ClipAndCreateResult> {
  const { url, userId, db } = input;

  if (!isClipUrlAllowed(url)) {
    throw new Error("URL not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let html: string;
  let finalUrl: string;

  try {
    ({ html, finalUrl } = await fetchHtmlWithRedirects(url, controller));
  } finally {
    clearTimeout(timeout);
  }
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

  const mainJson = await clipDocMutex.runExclusive(async () => {
    const prevDocument = (globalThis as { document?: Document }).document;
    (globalThis as { document?: Document }).document = document;
    try {
      return generateJSON(cleanContent, extensions) as {
        type: string;
        content?: Array<{ type: string; attrs?: Record<string, unknown> }>;
      };
    } finally {
      (globalThis as { document?: Document }).document = prevDocument;
    }
  });

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

  const result = await db.transaction(async (tx) => {
    const [page] = await tx
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

    await tx.insert(pageContents).values({
      pageId: page.id,
      ydocState: Buffer.from(ydocBase64, "base64"),
      version: 1,
      contentText: contentText || null,
    });

    return { page, title, thumbnailUrl };
  });

  return {
    page_id: result.page.id,
    title: result.title,
    thumbnail_url: result.thumbnailUrl ?? null,
  };
}
