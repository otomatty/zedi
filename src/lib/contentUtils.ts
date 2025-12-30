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

function extractTextFromNode(node: any): string {
  if (!node) return '';
  
  if (node.type === 'text') {
    return node.text || '';
  }
  
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromNode).join(' ');
  }
  
  return '';
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

function findFirstImage(node: any): string | null {
  if (!node) return null;
  
  if (node.type === 'image' && node.attrs?.src) {
    return node.attrs.src;
  }
  
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
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
