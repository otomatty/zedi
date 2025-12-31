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

function convertNode(node: TiptapNode): string {
  if (!node) return "";

  switch (node.type) {
    case "doc":
      return convertChildren(node);

    case "paragraph":
      return convertChildren(node) + "\n\n";

    case "heading": {
      const level = (node.attrs?.level as number) || 1;
      const prefix = "#".repeat(level);
      return `${prefix} ${convertChildren(node)}\n\n`;
    }

    case "bulletList":
      return convertList(node, "-") + "\n";

    case "orderedList":
      return convertOrderedList(node) + "\n";

    case "listItem":
      return convertChildren(node);

    case "blockquote": {
      const quoteContent = convertChildren(node).trim();
      return (
        quoteContent
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") + "\n\n"
      );
    }

    case "codeBlock": {
      const language = (node.attrs?.language as string) || "";
      const code = convertChildren(node).trim();
      return `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    }

    case "horizontalRule":
      return "---\n\n";

    case "hardBreak":
      return "\n";

    case "text":
      return applyMarks(node.text || "", node.marks || []);

    case "wikiLink": {
      // Handle wiki links [[Link Text]]
      const linkText = (node.attrs?.title as string) || "";
      return `[[${linkText}]]`;
    }

    case "image": {
      const src = (node.attrs?.src as string) || "";
      const alt = (node.attrs?.alt as string) || "";
      const title = (node.attrs?.title as string) || "";
      if (title) {
        return `![${alt}](${src} "${title}")\n\n`;
      }
      return `![${alt}](${src})\n\n`;
    }

    case "link":
      // This is typically a mark, not a node type
      return convertChildren(node);

    default:
      // For unknown node types, try to convert children
      return convertChildren(node);
  }
}

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
          child.type === "bulletList"
            ? convertList(child, "-")
            : convertOrderedList(child);
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
 * Download content as a Markdown file
 */
export function downloadMarkdown(title: string, content: string): void {
  const markdown = tiptapToMarkdown(content);

  // Add title as H1 if not empty
  const fullContent = title ? `# ${title}\n\n${markdown}` : markdown;

  const blob = new Blob([fullContent], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFilename(title || "無題のページ") + ".md";
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
  content: string
): Promise<void> {
  const markdown = tiptapToMarkdown(content);

  // Add title as H1 if not empty
  const fullContent = title ? `# ${title}\n\n${markdown}` : markdown;

  await navigator.clipboard.writeText(fullContent);
}
