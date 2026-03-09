import type { PageSummary } from "@/types/page";
import { MAX_REFERENCED_PAGES, type ReferencedPage } from "@/types/aiChat";
import { extractWikiLinksFromContent } from "./wikiLinkUtils";
import { convertMarkdownToTiptapContent } from "./markdownToTiptap";

export { convertMarkdownToTiptapContent } from "./markdownToTiptap";

type TiptapDoc = {
  type: "doc";
  content: Array<{ type: string; attrs?: Record<string, unknown>; content?: unknown[] }>;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizePageTitle(title: string): string {
  return title.toLowerCase().trim();
}

function parseTiptapDoc(content: string): TiptapDoc | null {
  if (!content.trim()) {
    return { type: "doc", content: [] };
  }

  try {
    const parsed = JSON.parse(content) as Partial<TiptapDoc>;
    if (parsed.type !== "doc") return null;
    if (!Array.isArray(parsed.content)) return null;
    return {
      type: "doc",
      content: parsed.content,
    };
  } catch {
    return null;
  }
}

export function appendTiptapContent(existingContent: string, appendedContent: string): string {
  const existingDoc = parseTiptapDoc(existingContent);
  const appendedDoc = parseTiptapDoc(appendedContent);

  if (!existingDoc) {
    throw new Error("Invalid existing Tiptap document");
  }
  if (!appendedDoc) {
    throw new Error("Invalid appended Tiptap document");
  }

  return JSON.stringify({
    type: "doc",
    content: [...existingDoc.content, ...appendedDoc.content],
  } satisfies TiptapDoc);
}

export function appendMarkdownToTiptapContent(existingContent: string, markdown: string): string {
  return appendTiptapContent(existingContent, convertMarkdownToTiptapContent(markdown));
}

export function buildSuggestedWikiLinksMarkdown(titles: string[]): string {
  return titles
    .map((title) => title.trim())
    .filter(Boolean)
    .map((title) => `- [[${title}]]`)
    .join("\n");
}

export function getMissingSuggestedWikiLinkTitles(
  existingContent: string,
  suggestedTitles: string[],
): string[] {
  const existingTitles = new Set(
    extractWikiLinksFromContent(existingContent).map((link) => normalizePageTitle(link.title)),
  );
  const seen = new Set<string>();

  return suggestedTitles
    .map((title) => title.trim())
    .filter(Boolean)
    .filter((title) => {
      const normalized = normalizePageTitle(title);
      if (existingTitles.has(normalized) || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
}

export function resolveReferencedPagesFromContent(
  content: string,
  pages: Pick<PageSummary, "id" | "title" | "isDeleted">[],
): ReferencedPage[] {
  if (!content.trim() || pages.length === 0) return [];

  const candidates = [...pages]
    .filter((page) => !page.isDeleted && page.title.trim().length > 0)
    .sort((a, b) => b.title.length - a.title.length);

  const takenRanges: Array<{ start: number; end: number }> = [];
  const matches: Array<{ start: number; page: ReferencedPage }> = [];

  for (const page of candidates) {
    const pattern = new RegExp(
      `(^|[\\s\\u00A0])@${escapeRegExp(page.title)}(?=[\\s\\p{P}\\p{S}]|$)`,
      "giu",
    );

    for (const match of content.matchAll(pattern)) {
      const prefix = match[1] ?? "";
      const matchStart = (match.index ?? 0) + prefix.length;
      const matchEnd = matchStart + 1 + page.title.length;
      const overlaps = takenRanges.some(
        (range) => matchStart < range.end && range.start < matchEnd,
      );
      if (overlaps) continue;

      takenRanges.push({ start: matchStart, end: matchEnd });
      matches.push({
        start: matchStart,
        page: {
          id: page.id,
          title: page.title,
        },
      });
    }
  }

  const seen = new Set<string>();
  return matches
    .sort((a, b) => a.start - b.start)
    .map((match) => match.page)
    .filter((page) => {
      if (seen.has(page.id)) return false;
      seen.add(page.id);
      return true;
    })
    .slice(0, MAX_REFERENCED_PAGES);
}
