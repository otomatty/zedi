/**
 * Markdown → Tiptap 変換用ヘルパー（parseInlineContent, sanitizeLinkUrl）
 * markdownToTiptap.ts と共有。
 */

export type TiptapTextNode = {
  type: "text";
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

type TiptapMark = { type: string; attrs?: Record<string, unknown> };

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

function marksEqual(a?: TiptapMark[], b?: TiptapMark[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function appendTextNode(content: TiptapTextNode[], text: string, marks?: TiptapMark[]): void {
  if (!text) return;
  const lastNode = content[content.length - 1];
  if (lastNode?.type === "text" && marksEqual(lastNode.marks, marks)) {
    lastNode.text = `${lastNode.text ?? ""}${text}`;
    return;
  }
  content.push({ type: "text", text, ...(marks != null ? { marks } : {}) });
}

function applyMark(nodes: TiptapTextNode[], mark: TiptapMark): TiptapTextNode[] {
  return nodes.map((node) => ({
    ...node,
    marks: [...(node.marks ?? []), mark],
  }));
}

function findClosingDelimiter(text: string, start: number, delimiter: string): number {
  let index = start;
  while (index < text.length) {
    const nextIndex = text.indexOf(delimiter, index);
    if (nextIndex === -1) return -1;
    if (text[nextIndex - 1] !== "\\") {
      return nextIndex;
    }
    index = nextIndex + delimiter.length;
  }
  return -1;
}

function findWikiLinkEnd(text: string, start: number): number {
  return text.indexOf("]]", start);
}

function parseMarkdownLink(
  text: string,
  start: number,
): { end: number; label: string; url: string } | null {
  let labelEnd = -1;
  let bracketDepth = 0;
  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\\" && i + 1 < text.length) {
      i += 1;
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      continue;
    }
    if (char === "]") {
      if (bracketDepth === 0) {
        labelEnd = i;
        break;
      }
      bracketDepth -= 1;
    }
  }
  if (labelEnd === -1 || text[labelEnd + 1] !== "(") return null;

  let url = "";
  let parenDepth = 0;
  for (let i = labelEnd + 2; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\\" && i + 1 < text.length) {
      url += char + text[i + 1];
      i += 1;
      continue;
    }
    if (char === "(") {
      parenDepth += 1;
      url += char;
      continue;
    }
    if (char === ")") {
      if (parenDepth === 0) {
        return {
          end: i + 1,
          label: text.slice(start + 1, labelEnd),
          url,
        };
      }
      parenDepth -= 1;
      url += char;
      continue;
    }
    url += char;
  }

  return null;
}

function parseInlineContentRecursive(text: string): TiptapTextNode[] {
  const content: TiptapTextNode[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.startsWith("[[", index)) {
      const wikiLinkEnd = findWikiLinkEnd(text, index + 2);
      if (wikiLinkEnd !== -1) {
        const title = text.slice(index + 2, wikiLinkEnd);
        appendTextNode(content, `[[${title}]]`, [
          {
            type: "wikiLink",
            attrs: {
              title,
              exists: false,
            },
          },
        ]);
        index = wikiLinkEnd + 2;
        continue;
      }
    }

    if (text[index] === "[") {
      const parsedLink = parseMarkdownLink(text, index);
      if (parsedLink != null) {
        const safeHref = sanitizeLinkUrl(parsedLink.url);
        if (safeHref != null) {
          const labelNodes = parseInlineContentRecursive(parsedLink.label);
          content.push(
            ...applyMark(labelNodes, {
              type: "link",
              attrs: {
                href: safeHref,
                target: "_blank",
                rel: "noopener noreferrer",
              },
            }),
          );
        } else {
          appendTextNode(content, text.slice(index, parsedLink.end));
        }
        index = parsedLink.end;
        continue;
      }
    }

    if (text.startsWith("***", index)) {
      const end = findClosingDelimiter(text, index + 3, "***");
      if (end !== -1) {
        const innerNodes = parseInlineContentRecursive(text.slice(index + 3, end));
        content.push(...applyMark(applyMark(innerNodes, { type: "bold" }), { type: "italic" }));
        index = end + 3;
        continue;
      }
    }

    if (text.startsWith("**", index)) {
      const end = findClosingDelimiter(text, index + 2, "**");
      if (end !== -1) {
        const innerNodes = parseInlineContentRecursive(text.slice(index + 2, end));
        content.push(...applyMark(innerNodes, { type: "bold" }));
        index = end + 2;
        continue;
      }
    }

    if (text[index] === "*") {
      const end = findClosingDelimiter(text, index + 1, "*");
      if (end !== -1) {
        const innerNodes = parseInlineContentRecursive(text.slice(index + 1, end));
        content.push(...applyMark(innerNodes, { type: "italic" }));
        index = end + 1;
        continue;
      }
    }

    const nextSpecialIndex = [
      text.indexOf("[[", index),
      text.indexOf("[", index),
      text.indexOf("*", index),
    ]
      .filter((value) => value !== -1)
      .reduce((min, value) => Math.min(min, value), text.length);
    if (nextSpecialIndex === index) {
      appendTextNode(content, text[index]);
      index += 1;
      continue;
    }
    appendTextNode(content, text.slice(index, nextSpecialIndex));
    index = nextSpecialIndex;
  }

  return content;
}

/**
 * インライン要素（WikiLink, リンク, 太字, 斜体）をパースして Tiptap テキストノード配列に変換
 */
export function parseInlineContent(text: string): TiptapTextNode[] {
  const content = parseInlineContentRecursive(text);
  if (content.length > 0) return content;
  return text.length > 0 ? [{ type: "text", text }] : [];
}
