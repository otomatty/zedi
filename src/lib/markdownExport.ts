// Convert Tiptap JSON to Markdown

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * Convert Tiptap JSON content to Markdown string
 */
export function tiptapToMarkdown(content: string): string {
  if (!content) return "";

  try {
    const doc = JSON.parse(content) as TiptapNode;
    return convertNode(doc).trim();
  } catch {
    // If not valid JSON, return as-is (might already be plain text)
    return content;
  }
}

type NodeHandler = (node: TiptapNode) => string;

const nodeHandlers: Record<string, NodeHandler> = {};

function convertNode(node: TiptapNode): string {
  if (!node) return "";
  const handler = nodeHandlers[node.type];
  return handler ? handler(node) : convertChildren(node);
}

Object.assign(nodeHandlers, {
  doc: (n) => convertChildren(n),
  paragraph: (n) => convertChildren(n) + "\n\n",
  heading: (n) => {
    // 本文の見出しは body schema 上 h2–h5（level 2–5）。level が欠落している旧データでも
    // ページタイトルと衝突する `#` 1 個に潰さず、最小の本文見出しレベル `##` にフォールバック
    // する。これにより `convertMarkdownToTiptapContent` との round-trip が対称に保たれる。
    // Body headings span schema levels 2–5. If the level attribute is missing on legacy data,
    // fall back to `##` (the minimum body heading) instead of `#`, which would clash with the
    // page title and round-trip back to a literal `# X` paragraph in `convertMarkdownToTiptapContent`.
    const rawLevel = n.attrs?.level;
    const level = typeof rawLevel === "number" && rawLevel >= 2 ? rawLevel : 2;
    const prefix = "#".repeat(level);
    return `${prefix} ${convertChildren(n)}\n\n`;
  },
  bulletList: (n) => convertList(n, "-") + "\n",
  orderedList: (n) => convertOrderedList(n) + "\n",
  listItem: (n) => convertChildren(n),
  blockquote: (n) => {
    const quoteContent = convertChildren(n).trim();
    return (
      quoteContent
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n") + "\n\n"
    );
  },
  codeBlock: (n) => {
    const language = (n.attrs?.language as string) || "";
    const code = convertChildren(n).trim();
    return `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
  },
  horizontalRule: () => "---\n\n",
  hardBreak: () => "\n",
  text: (n) => applyMarks(n.text || "", n.marks || []),
  wikiLink: (n) => {
    const linkText = (n.attrs?.title as string) || "";
    return `[[${linkText}]]`;
  },
  image: (n) => {
    const src = (n.attrs?.src as string) || "";
    const alt = (n.attrs?.alt as string) || "";
    const title = (n.attrs?.title as string) || "";
    return title ? `![${alt}](${src} "${title}")\n\n` : `![${alt}](${src})\n\n`;
  },
  youtubeEmbed: (n) => {
    // 異常な videoId が Markdown 構文を壊さないよう、厳格に検証してからエンコードする
    // Strictly validate videoId to prevent malformed Markdown; encode before embedding.
    // Use `typeof === "string"` instead of `as string` because the `as` cast is
    // a TypeScript-only hint; if the runtime value is e.g. an object, calling
    // `.trim()` on it would throw and break export/copy.
    // `as string` は実行時保護にならないため、`typeof` で確実に文字列チェックする。
    const rawVideoId = n.attrs?.videoId;
    const videoId = typeof rawVideoId === "string" ? rawVideoId.trim() : "";
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return "";
    return `[YouTube](https://www.youtube.com/watch?v=${encodeURIComponent(videoId)})\n\n`;
  },
  link: (n) => convertChildren(n),
});

function convertChildren(node: TiptapNode): string {
  if (!node.content) return "";
  return node.content.map(convertNode).join("");
}

function convertList(node: TiptapNode, marker: string): string {
  if (!node.content) return "";

  return node.content
    .map((item) => {
      const itemContent = convertListItemContent(item);
      return `${marker} ${itemContent}`;
    })
    .join("\n");
}

function convertOrderedList(node: TiptapNode): string {
  if (!node.content) return "";

  return node.content
    .map((item, index) => {
      const itemContent = convertListItemContent(item);
      return `${index + 1}. ${itemContent}`;
    })
    .join("\n");
}

function convertListItemContent(item: TiptapNode): string {
  if (!item.content) return "";

  return item.content
    .map((child) => {
      if (child.type === "paragraph") {
        return convertChildren(child).trim();
      }
      // Handle nested lists
      if (child.type === "bulletList" || child.type === "orderedList") {
        const nestedList =
          child.type === "bulletList" ? convertList(child, "-") : convertOrderedList(child);
        return (
          "\n" +
          nestedList
            .split("\n")
            .map((line) => "  " + line)
            .join("\n")
        );
      }
      return convertNode(child);
    })
    .join("");
}

function applyMarks(text: string, marks: TiptapMark[]): string {
  if (!marks || marks.length === 0) return text;

  let result = text;

  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        result = `**${result}**`;
        break;
      case "italic":
        result = `*${result}*`;
        break;
      case "strike":
        result = `~~${result}~~`;
        break;
      case "code":
        result = `\`${result}\``;
        break;
      case "link": {
        const href = (mark.attrs?.href as string) || "";
        const title = mark.attrs?.title as string | undefined;
        if (title) {
          result = `[${result}](${href} "${title}")`;
        } else {
          result = `[${result}](${href})`;
        }
        break;
      }
      // Skip other marks that don't have Markdown equivalents
    }
  }

  return result;
}

/**
 * Markdown エクスポートのオプション。ファイル名や引用元ラベルを指定可能。
 * Options for Markdown export. Configures filename, attribution label, etc.
 */
export interface MarkdownExportOptions {
  /** Default title when empty (for filename) */
  defaultTitle?: string;
  /** Label for source attribution block (e.g. "📎 引用元:") */
  attributionLabel?: string;
}

/**
 * Build source attribution block for Markdown export (optional).
 * Uses angle-bracket autolink for URLs to avoid Markdown parsing issues with parens/brackets.
 */
function buildSourceAttribution(sourceUrl?: string | null, attributionLabel?: string): string {
  if (!sourceUrl?.trim()) return "";
  const label = attributionLabel?.trim() || "📎 Source:";
  return `> ${label} <${sourceUrl.trim()}>\n\n`;
}

/**
 * Download content as a Markdown file
 */
export function downloadMarkdown(
  title: string,
  content: string,
  sourceUrl?: string | null,
  options?: MarkdownExportOptions,
): void {
  const { defaultTitle = "Untitled", attributionLabel } = options ?? {};
  const normalizedTitle = title.trim();
  const markdown = tiptapToMarkdown(content);
  const attribution = buildSourceAttribution(sourceUrl, attributionLabel);

  const fullContent = normalizedTitle
    ? `# ${normalizedTitle}\n\n${attribution}${markdown}`
    : `${attribution}${markdown}`;

  const blob = new Blob([fullContent], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFilename(normalizedTitle || defaultTitle) + ".md";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Sanitize filename for safe file system usage
 */
function sanitizeFilename(name: string): string {
  // Remove or replace characters that are invalid in filenames
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 100); // Limit filename length
}

/**
 * Copy Markdown content to clipboard
 */
export async function copyMarkdownToClipboard(
  title: string,
  content: string,
  sourceUrl?: string | null,
  options?: MarkdownExportOptions,
): Promise<void> {
  const { attributionLabel } = options ?? {};
  const normalizedTitle = title.trim();
  const markdown = tiptapToMarkdown(content);
  const attribution = buildSourceAttribution(sourceUrl, attributionLabel);

  const fullContent = normalizedTitle
    ? `# ${normalizedTitle}\n\n${attribution}${markdown}`
    : `${attribution}${markdown}`;

  await navigator.clipboard.writeText(fullContent);
}
