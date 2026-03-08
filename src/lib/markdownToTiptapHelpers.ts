/**
 * Markdown → Tiptap 変換用ヘルパー（parseInlineContent, sanitizeLinkUrl）
 * markdownToTiptap.ts と共有。
 */

export type TiptapTextNode = {
  type: "text";
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

type MatchInfo = {
  index: number;
  length: number;
  text: string;
  type: "wikiLink" | "link" | "bold" | "italic" | "boldItalic";
  url?: string;
};

const SAFE_LINK_PROTOCOLS = new Set(["https:", "http:", "mailto:", "tel:"]);

/**
 * リンクURLをサニタイズ（javascript:, data: 等を拒否）
 */
export function sanitizeLinkUrl(url: string): string | null {
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

/**
 * インライン要素（WikiLink, リンク, 太字, 斜体）をパースして Tiptap テキストノード配列に変換
 */
export function parseInlineContent(text: string): TiptapTextNode[] {
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

  const tripleRegex = /\*\*\*([^*]+)\*\*\*/g;
  while ((match = tripleRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      type: "boldItalic",
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
        content.push({
          type: "text",
          text: text.slice(item.index, item.index + item.length),
        });
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
    } else if (item.type === "boldItalic") {
      content.push({
        type: "text",
        text: item.text,
        marks: [{ type: "bold" }, { type: "italic" }],
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
