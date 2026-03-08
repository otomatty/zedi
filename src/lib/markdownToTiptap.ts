/**
 * Markdown → Tiptap JSON 変換の共通モジュール。
 * wikiGenerator と aiChatActionHelpers の両方で利用。
 */

type TiptapTextNode = {
  type: "text";
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

type TiptapBlockNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<TiptapBlockNode | TiptapTextNode>;
};

type MatchInfo = {
  index: number;
  length: number;
  text: string;
  type: "wikiLink" | "link" | "bold" | "italic";
  url?: string;
};

const SAFE_LINK_PROTOCOLS = new Set(["https:", "http:", "mailto:", "tel:"]);

function sanitizeLinkUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:")
  ) {
    return null;
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed, "https://example.com");
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
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
      const safeHref = item.url != null ? sanitizeLinkUrl(item.url) : null;
      if (safeHref != null) {
        content.push({
          type: "text",
          text: item.text,
          marks: [
            {
              type: "link",
              attrs: {
                href: safeHref,
                target: "_blank",
                rel: "noopener noreferrer",
              },
            },
          ],
        });
      } else {
        content.push({ type: "text", text: item.text });
      }
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
  const doc: { type: "doc"; content: TiptapBlockNode[] } = {
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
