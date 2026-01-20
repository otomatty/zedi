// Supported node types in zedi's Tiptap schema
const SUPPORTED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'mermaid',
  'image', // 画像挿入機能のサポート
  'imageUpload', // 画像アップロード中のプレースホルダー
]);

// Supported mark types in zedi's Tiptap schema
const SUPPORTED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
  'wikiLink',
]);

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
      content: '',
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

    return {
      content: JSON.stringify(sanitizedDoc),
      hadErrors: removedNodeTypes.size > 0 || removedMarkTypes.size > 0,
      removedNodeTypes: Array.from(removedNodeTypes),
      removedMarkTypes: Array.from(removedMarkTypes),
    };
  } catch (e) {
    // If JSON parsing fails, return empty content with error
    console.error('Failed to parse Tiptap content:', e);
    return {
      content: JSON.stringify({ type: 'doc', content: [] }),
      hadErrors: true,
      removedNodeTypes: [],
      removedMarkTypes: ['JSON parse error'],
    };
  }
}

/**
 * Recursively sanitize a node and its children
 */
function sanitizeNode(
  node: Record<string, unknown>,
  removedNodeTypes: Set<string>,
  removedMarkTypes: Set<string>
): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') {
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
          type: 'paragraph',
          content: [{ type: 'text', text: `[${nodeType}] ${textContent}` }],
        };
      }
    }

    // If there's text directly in the node (shouldn't happen but just in case)
    if (node.text && typeof node.text === 'string') {
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: `[${nodeType}] ${node.text}` }],
      };
    }

    // Skip the node entirely if no text content
    return null;
  }

  // Create a copy of the node
  const sanitizedNode: Record<string, unknown> = { ...node };

  // Sanitize marks if present
  if (node.marks && Array.isArray(node.marks)) {
    const sanitizedMarks = (node.marks as Array<Record<string, unknown>>).filter(
      (mark) => {
        const markType = mark.type as string;
        if (!SUPPORTED_MARK_TYPES.has(markType)) {
          removedMarkTypes.add(markType);
          return false;
        }
        return true;
      }
    );

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
  if (node.text && typeof node.text === 'string') {
    return node.text;
  }

  if (node.content && Array.isArray(node.content)) {
    return (node.content as Array<Record<string, unknown>>)
      .map((child) => extractTextFromUnsupportedNode(child))
      .filter(Boolean)
      .join(' ');
  }

  return '';
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
  if (!node || typeof node !== 'object') return;

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

// Extract plain text from Tiptap JSON content
export function extractPlainText(content: string): string {
  if (!content) return '';
  
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

// Get a preview snippet of the content
export function getContentPreview(content: string, maxLength: number = 100): string {
  const plainText = extractPlainText(content);
  const trimmed = plainText.trim().replace(/\s+/g, ' ');
  
  if (trimmed.length <= maxLength) return trimmed;
  
  return trimmed.slice(0, maxLength).trim() + '...';
}

// Extract first image URL from Tiptap content
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

// Extract wiki links [[Link Text]] from content
export function extractWikiLinks(content: string): string[] {
  const plainText = extractPlainText(content);
  const matches = plainText.match(/\[\[([^\]]+)\]\]/g);
  
  if (!matches) return [];
  
  return matches.map((match) => match.slice(2, -2).trim());
}

// Generate auto title from content
export function generateAutoTitle(content: string): string {
  const plainText = extractPlainText(content);
  const firstLine = plainText.split('\n')[0]?.trim() || '';
  
  if (!firstLine) return '無題のページ';
  
  // Use first 40 characters of the first line
  if (firstLine.length <= 40) return firstLine;
  
  return firstLine.slice(0, 40).trim() + '...';
}

/**
 * Build error message from sanitize result
 */
export function buildContentErrorMessage(result: SanitizeResult): string {
  const parts: string[] = [];

  if (result.removedNodeTypes.length > 0) {
    parts.push(`未対応のノード: ${result.removedNodeTypes.join(", ")}`);
  }
  if (result.removedMarkTypes.length > 0) {
    parts.push(`未対応のマーク: ${result.removedMarkTypes.join(", ")}`);
  }

  if (parts.length === 0) {
    return "コンテンツに問題がありました。";
  }

  return `移行データに問題があります。${parts.join("、")}が含まれていたため自動的に修正されました。`;
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
    const hasRealContent = parsed.content.some(
      (node: { type: string; content?: unknown[] }) => {
        if (node.type === "paragraph") {
          return node.content && node.content.length > 0;
        }
        return true; // 段落以外のノード（見出しなど）があればtrue
      }
    );
    return hasRealContent;
  } catch {
    return contentJson.trim().length > 0;
  }
}
