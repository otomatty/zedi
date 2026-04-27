import i18n from "@/i18n";

// Supported node types in zedi's Tiptap schema
const SUPPORTED_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "mermaid",
  "image", // 画像挿入機能のサポート
  "imageUpload", // 画像アップロード中のプレースホルダー
  // Phase 1: タスクリスト
  "taskList",
  "taskItem",
  // Phase 2: テーブル
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  // Phase 4: 数式
  "math",
  "mathBlock",
  // HTML Artifact (Claude interactive HTML)
  "htmlArtifact",
  // YouTube 動画埋め込み
  "youtubeEmbed",
]);

// Supported mark types in zedi's Tiptap schema
const SUPPORTED_MARK_TYPES = new Set([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "wikiLink",
  // Hashtag syntax `#name` — shares the WikiLink data model. See issue #725.
  // `#name` 記法のタグマーク。WikiLink と同じデータモデルを共有する。
  "tag",
  // Phase 1: ハイライト・下線
  "highlight",
  "underline",
  // Phase 3: 文字色
  "textStyle",
]);

/**
 * Result of sanitizing Tiptap JSON (unsupported nodes/marks removed).
 * Tiptap JSON のサニタイズ結果（未対応ノード/マーク除去後）。
 */
export interface SanitizeResult {
  content: string;
  hadErrors: boolean;
  removedNodeTypes: string[];
  removedMarkTypes: string[];
}

/**
 * Sanitize Tiptap JSON content by removing unsupported node and mark types.
 * This prevents errors when loading content with unknown types.
 */
export function sanitizeTiptapContent(content: string): SanitizeResult {
  if (!content) {
    return {
      content: "",
      hadErrors: false,
      removedNodeTypes: [],
      removedMarkTypes: [],
    };
  }

  try {
    const doc = JSON.parse(content);
    const removedNodeTypes = new Set<string>();
    const removedMarkTypes = new Set<string>();

    const sanitizedDoc = sanitizeNode(doc, removedNodeTypes, removedMarkTypes);

    // Promote plain-text [[...]] patterns to wikiLink marks
    const promotedDoc = sanitizedDoc ? promoteWikiLinksInNode(sanitizedDoc) : sanitizedDoc;

    return {
      content: JSON.stringify(promotedDoc),
      hadErrors: removedNodeTypes.size > 0 || removedMarkTypes.size > 0,
      removedNodeTypes: Array.from(removedNodeTypes),
      removedMarkTypes: Array.from(removedMarkTypes),
    };
  } catch (e) {
    // If JSON parsing fails, return empty content with error
    console.error("Failed to parse Tiptap content:", e);
    return {
      content: JSON.stringify({ type: "doc", content: [] }),
      hadErrors: true,
      removedNodeTypes: [],
      removedMarkTypes: ["JSON parse error"],
    };
  }
}

/**
 * Split a text node's text by [[...]] patterns and produce an array of text nodes,
 * applying wikiLink marks to the matched segments.
 * Existing marks on the original node are preserved on all resulting segments.
 */
function splitTextNodeByWikiLinks(textNode: Record<string, unknown>): Record<string, unknown>[] {
  const text = textNode.text as string;
  if (!text) return [textNode];

  const existingMarks = (textNode.marks as Array<Record<string, unknown>>) || [];

  const hasWikiLinkMark = existingMarks.some(
    (m) => (m as Record<string, unknown>).type === "wikiLink",
  );
  if (hasWikiLinkMark) return [textNode];

  // Skip text nodes with inline code marks
  const hasCodeMark = existingMarks.some((m) => (m as Record<string, unknown>).type === "code");
  if (hasCodeMark) return [textNode];

  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  const result: Record<string, unknown>[] = [];
  let lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({
        type: "text",
        text: text.slice(lastIndex, match.index),
        ...(existingMarks.length > 0 ? { marks: existingMarks } : {}),
      });
    }

    const title = match[1].trim();
    if (!title) {
      result.push({
        type: "text",
        text: match[0],
        ...(existingMarks.length > 0 ? { marks: existingMarks } : {}),
      });
      lastIndex = regex.lastIndex;
      continue;
    }
    const wikiLinkMark: Record<string, unknown> = {
      type: "wikiLink",
      attrs: { title, exists: false, referenced: false },
    };
    result.push({
      type: "text",
      text: match[0],
      marks: [...existingMarks, wikiLinkMark],
    });
    lastIndex = regex.lastIndex;
  }

  if (result.length === 0) return [textNode];

  if (lastIndex < text.length) {
    result.push({
      type: "text",
      text: text.slice(lastIndex),
      ...(existingMarks.length > 0 ? { marks: existingMarks } : {}),
    });
  }

  return result;
}

/**
 * Recursively promote plain-text [[...]] patterns to wikiLink marks.
 * Returns a new node tree (does not mutate in place).
 */
const SKIP_WIKILINK_PROMOTION_NODES = new Set(["codeBlock", "code_block"]);

function promoteWikiLinksInNode(node: Record<string, unknown>): Record<string, unknown> {
  if (!node || typeof node !== "object") return node;

  // Don't promote inside code blocks
  if (SKIP_WIKILINK_PROMOTION_NODES.has(node.type as string)) return node;

  const result: Record<string, unknown> = { ...node };

  if (Array.isArray(node.content)) {
    const newContent: Record<string, unknown>[] = [];
    for (const child of node.content as Array<Record<string, unknown>>) {
      if (child.type === "text" && typeof child.text === "string") {
        newContent.push(...splitTextNodeByWikiLinks(child));
      } else {
        newContent.push(promoteWikiLinksInNode(child));
      }
    }
    result.content = newContent;
  }

  return result;
}

/**
 * Recursively sanitize a node and its children
 */
function sanitizeNode(
  node: Record<string, unknown>,
  removedNodeTypes: Set<string>,
  removedMarkTypes: Set<string>,
): Record<string, unknown> | null {
  if (!node || typeof node !== "object") {
    return null;
  }

  const nodeType = node.type as string;

  // Check if node type is supported
  if (!SUPPORTED_NODE_TYPES.has(nodeType)) {
    removedNodeTypes.add(nodeType);

    // Try to preserve text content from unsupported nodes
    if (node.content && Array.isArray(node.content)) {
      // Return a paragraph with the text content
      const textContent = extractTextFromUnsupportedNode(node);
      if (textContent) {
        return {
          type: "paragraph",
          content: [{ type: "text", text: `[${nodeType}] ${textContent}` }],
        };
      }
    }

    // If there's text directly in the node (shouldn't happen but just in case)
    if (node.text && typeof node.text === "string") {
      return {
        type: "paragraph",
        content: [{ type: "text", text: `[${nodeType}] ${node.text}` }],
      };
    }

    // Skip the node entirely if no text content
    return null;
  }

  // Create a copy of the node
  const sanitizedNode: Record<string, unknown> = { ...node };

  // 本文最上位を h2 に揃え、古い Tiptap JSON（level:1 や欠損＝1 相当）を 2 へ
  if (nodeType === "heading") {
    const attrs = { ...((node.attrs as Record<string, unknown> | undefined) ?? {}) };
    const level = typeof attrs.level === "number" ? attrs.level : 1;
    if (level < 2) {
      attrs.level = 2;
      sanitizedNode.attrs = attrs;
    }
  }

  // Sanitize marks if present
  if (node.marks && Array.isArray(node.marks)) {
    const sanitizedMarks = (node.marks as Array<Record<string, unknown>>).filter((mark) => {
      const markType = mark.type as string;
      if (!SUPPORTED_MARK_TYPES.has(markType)) {
        removedMarkTypes.add(markType);
        return false;
      }
      return true;
    });

    if (sanitizedMarks.length > 0) {
      sanitizedNode.marks = sanitizedMarks;
    } else {
      delete sanitizedNode.marks;
    }
  }

  // Recursively sanitize children
  if (node.content && Array.isArray(node.content)) {
    const sanitizedContent = (node.content as Array<Record<string, unknown>>)
      .map((child) => sanitizeNode(child, removedNodeTypes, removedMarkTypes))
      .filter((child): child is Record<string, unknown> => child !== null);

    sanitizedNode.content = sanitizedContent;
  }

  return sanitizedNode;
}

/**
 * Extract text from an unsupported node for preservation
 */
function extractTextFromUnsupportedNode(node: Record<string, unknown>): string {
  if (node.text && typeof node.text === "string") {
    return node.text;
  }

  if (node.content && Array.isArray(node.content)) {
    return (node.content as Array<Record<string, unknown>>)
      .map((child) => extractTextFromUnsupportedNode(child))
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

/**
 * Validate if Tiptap content is valid (can be parsed without errors)
 */
export function validateTiptapContent(content: string): {
  isValid: boolean;
  errors: string[];
} {
  if (!content) {
    return { isValid: true, errors: [] };
  }

  try {
    const doc = JSON.parse(content);
    const errors: string[] = [];

    validateNode(doc, errors);

    return { isValid: errors.length === 0, errors };
  } catch (e) {
    return { isValid: false, errors: [`JSON parse error: ${e}`] };
  }
}

/**
 * Recursively validate a node
 */
function validateNode(node: Record<string, unknown>, errors: string[]): void {
  if (!node || typeof node !== "object") return;

  const nodeType = node.type as string;

  if (!SUPPORTED_NODE_TYPES.has(nodeType)) {
    errors.push(`Unsupported node type: ${nodeType}`);
  }

  if (node.marks && Array.isArray(node.marks)) {
    for (const mark of node.marks as Array<Record<string, unknown>>) {
      const markType = mark.type as string;
      if (!SUPPORTED_MARK_TYPES.has(markType)) {
        errors.push(`Unsupported mark type: ${markType}`);
      }
    }
  }

  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content as Array<Record<string, unknown>>) {
      validateNode(child, errors);
    }
  }
}

/**
 * Extract plain text from Tiptap JSON content.
 * Tiptap JSON からプレーンテキストを抽出する。
 */
export function extractPlainText(content: string): string {
  if (!content) return "";

  try {
    const doc = JSON.parse(content);
    return extractTextFromNode(doc);
  } catch {
    // If not JSON, assume it's already plain text
    return content;
  }
}

function extractTextFromNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const typedNode = node as {
    type?: string;
    text?: string;
    content?: unknown[];
  };

  if (typedNode.type === "text") {
    return typeof typedNode.text === "string" ? typedNode.text : "";
  }

  if (Array.isArray(typedNode.content)) {
    return typedNode.content.map(extractTextFromNode).join(" ");
  }

  return "";
}

/**
 * Max length for page list preview text.
 * ページ一覧プレビュー文字列の最大長。
 */
export const PAGE_LIST_PREVIEW_LENGTH = 120;

/**
 * Get a preview snippet of the content (whitespace collapsed, optional truncation).
 * コンテンツのプレビュー断片を返す（空白を畳み、必要なら省略）。
 */
export function getContentPreview(content: string, maxLength: number = 100): string {
  const plainText = extractPlainText(content);
  const trimmed = plainText.trim().replace(/\s+/g, " ");

  if (trimmed.length <= maxLength) return trimmed;

  return trimmed.slice(0, maxLength).trim() + "...";
}

/**
 * Standard preview for page list UI.
 * ページ一覧 UI 用の標準プレビュー。
 */
export function getPageListPreview(content: string): string {
  return getContentPreview(content, PAGE_LIST_PREVIEW_LENGTH);
}

/**
 * Extract first image URL from Tiptap JSON or plain text.
 * Tiptap JSON またはプレーンテキストから先頭の画像 URL を取得する。
 */
export function extractFirstImage(content: string): string | null {
  if (!content) return null;

  try {
    const doc = JSON.parse(content);
    return findFirstImage(doc);
  } catch {
    // Check for image URLs in plain text
    const imgMatch = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/i);
    return imgMatch ? imgMatch[0] : null;
  }
}

function findFirstImage(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;

  const typedNode = node as {
    type?: string;
    attrs?: { src?: string };
    content?: unknown[];
  };

  if (typedNode.type === "image" && typedNode.attrs?.src) {
    return typedNode.attrs.src;
  }

  if (Array.isArray(typedNode.content)) {
    for (const child of typedNode.content) {
      const found = findFirstImage(child);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Extract wiki links `[[Link Text]]` from content.
 * コンテンツから `[[リンク文字]]` 形式の wiki リンクを抽出する。
 */
export function extractWikiLinks(content: string): string[] {
  const plainText = extractPlainText(content);
  const matches = plainText.match(/\[\[([^\]]+)\]\]/g);

  if (!matches) return [];

  return matches.map((match) => match.slice(2, -2).trim());
}

/**
 * Generate an auto title from the first line of plain text.
 * プレーンテキストの先頭行から自動タイトルを生成する。
 */
export function generateAutoTitle(content: string): string {
  const plainText = extractPlainText(content);
  const firstLine = plainText.split("\n")[0]?.trim() || "";

  if (!firstLine) return i18n.t("common.untitledPage");

  // Use first 40 characters of the first line
  if (firstLine.length <= 40) return firstLine;

  return firstLine.slice(0, 40).trim() + "...";
}

/**
 * Build error message from sanitize result
 */
export function buildContentErrorMessage(result: SanitizeResult): string {
  const parts: string[] = [];

  if (result.removedNodeTypes.length > 0) {
    parts.push(
      i18n.t("errors.contentUnsupportedNode", { types: result.removedNodeTypes.join(", ") }),
    );
  }
  if (result.removedMarkTypes.length > 0) {
    parts.push(
      i18n.t("errors.contentUnsupportedMark", { types: result.removedMarkTypes.join(", ") }),
    );
  }

  if (parts.length === 0) {
    return i18n.t("errors.contentInvalid");
  }

  return i18n.t("errors.migrationDataIssue", {
    fields: parts.join(i18n.t("common.listSeparator")),
  });
}

/**
 * Check if Tiptap JSON content is not empty
 * Returns true if content has real text or non-paragraph nodes
 */
export function isContentNotEmpty(contentJson: string): boolean {
  if (!contentJson) return false;
  try {
    const parsed = JSON.parse(contentJson);
    // doc.contentが空または空の段落のみかチェック
    if (!parsed.content || parsed.content.length === 0) return false;
    // 空の段落のみの場合もfalse
    const hasRealContent = parsed.content.some((node: { type: string; content?: unknown[] }) => {
      if (node.type === "paragraph") {
        return node.content && node.content.length > 0;
      }
      return true; // 段落以外のノード（見出しなど）があればtrue
    });
    return hasRealContent;
  } catch {
    return contentJson.trim().length > 0;
  }
}
