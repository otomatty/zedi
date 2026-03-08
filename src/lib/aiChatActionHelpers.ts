import type { PageSummary } from "@/types/page";
import { MAX_REFERENCED_PAGES, type ReferencedPage } from "@/types/aiChat";
import { extractWikiLinksFromContent } from "./wikiLinkUtils";

type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type TiptapTextNode = {
  type: "text";
  text?: string;
  marks?: TiptapMark[];
};

type TiptapBlockNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<TiptapBlockNode | TiptapTextNode>;
};

type TiptapDoc = {
  type: "doc";
  content: TiptapBlockNode[];
};

type MatchInfo = {
  index: number;
  length: number;
  text: string;
  type: "wikiLink" | "link" | "bold" | "italic";
  url?: string;
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
    return {
      type: "doc",
      content: Array.isArray(parsed.content) ? parsed.content : [],
    };
  } catch {
    return null;
  }
}

function parseInlineContent(text: string): TiptapTextNode[] {
  const content: TiptapTextNode[] = [];
  const matches: MatchInfo[] = [];

  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = wikiLinkRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      type: "wikiLink",
    });
  }

  const externalLinkRegex = /(?<!\[)\[([^[\]]+)\]\(([^)]+)\)/g;
  while ((match = externalLinkRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      url: match[2],
      type: "link",
    });
  }

  const boldRegex = /\*\*([^*]+)\*\*/g;
  while ((match = boldRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      type: "bold",
    });
  }

  const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
  while ((match = italicRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      type: "italic",
    });
  }

  matches.sort((a, b) => a.index - b.index);

  let lastIndex = 0;
  for (const item of matches) {
    if (item.index < lastIndex) continue;

    if (item.index > lastIndex) {
      content.push({
        type: "text",
        text: text.slice(lastIndex, item.index),
      });
    }

    if (item.type === "wikiLink") {
      content.push({
        type: "text",
        text: `[[${item.text}]]`,
        marks: [
          {
            type: "wikiLink",
            attrs: {
              title: item.text,
              exists: false,
            },
          },
        ],
      });
    } else if (item.type === "link") {
      content.push({
        type: "text",
        text: item.text,
        marks: [
          {
            type: "link",
            attrs: {
              href: item.url,
              target: "_blank",
              rel: "noopener noreferrer",
            },
          },
        ],
      });
    } else if (item.type === "bold") {
      content.push({
        type: "text",
        text: item.text,
        marks: [{ type: "bold" }],
      });
    } else if (item.type === "italic") {
      content.push({
        type: "text",
        text: item.text,
        marks: [{ type: "italic" }],
      });
    }

    lastIndex = item.index + item.length;
  }

  if (lastIndex < text.length) {
    content.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  if (content.length === 0 && text.length > 0) {
    content.push({
      type: "text",
      text,
    });
  }

  return content;
}

export function convertMarkdownToTiptapContent(markdown: string): string {
  const lines = markdown.split("\n");
  const doc: TiptapDoc = {
    type: "doc",
    content: [],
  };

  for (const line of lines) {
    if (line.trim() === "") {
      doc.content.push({ type: "paragraph" });
      continue;
    }

    if (line.startsWith("### ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 3 },
        content: parseInlineContent(line.slice(4)),
      });
      continue;
    }

    if (line.startsWith("## ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 2 },
        content: parseInlineContent(line.slice(3)),
      });
      continue;
    }

    if (line.startsWith("# ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 1 },
        content: parseInlineContent(line.slice(2)),
      });
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      const listItem: TiptapBlockNode = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineContent(line.slice(2)),
          },
        ],
      };

      const lastNode = doc.content[doc.content.length - 1];
      if (lastNode?.type === "bulletList") {
        if (!lastNode.content) lastNode.content = [];
        lastNode.content.push(listItem);
      } else {
        doc.content.push({
          type: "bulletList",
          content: [listItem],
        });
      }
      continue;
    }

    doc.content.push({
      type: "paragraph",
      content: parseInlineContent(line),
    });
  }

  return JSON.stringify(doc);
}

export function appendTiptapContent(existingContent: string, appendedContent: string): string {
  const existingDoc = parseTiptapDoc(existingContent);
  const appendedDoc = parseTiptapDoc(appendedContent);

  if (!existingDoc && !appendedDoc) {
    return convertMarkdownToTiptapContent("");
  }
  if (!existingDoc && appendedDoc) {
    return JSON.stringify(appendedDoc);
  }
  if (existingDoc && !appendedDoc) {
    return JSON.stringify(existingDoc);
  }

  return JSON.stringify({
    type: "doc",
    content: [...(existingDoc?.content ?? []), ...(appendedDoc?.content ?? [])],
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
