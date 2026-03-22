import type { PageSummary } from "@/types/page";
import {
  MAX_REFERENCED_PAGES,
  type ChatMessage,
  type CreatePageAction,
  type ReferencedPage,
} from "@/types/aiChat";
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

/**
 * Normalizes a page title for comparison (lowercase, trim).
 * 比較用にページタイトルを正規化する（小文字化・前後空白除去）。
 *
 * @param title - Raw title string / 生のタイトル文字列
 * @returns Normalized title / 正規化後の文字列
 */
export function normalizePageTitle(title: string): string {
  return title.toLowerCase().trim();
}

/**
 * Returns the outline string for create-page actions.
 * create-page アクションのアウトライン文字列を返す。
 */
export function getCreatePageOutline(action: CreatePageAction): string {
  return action.outline?.trim() ?? "";
}

/** Max characters of serialized chat sent to the page-body generation step. */
export const MAX_CHAT_CONTEXT_CHARS = 16_000;

/**
 * Serializes chat messages for the second-stage page generation prompt (recent tail if too long).
 * 第2段階プロンプト用に会話を連結（長い場合は末尾を切り詰め）。
 */
export function serializeChatMessagesForPageGeneration(messages: ChatMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const roleLabel = m.role === "user" ? "User" : "Assistant";
    lines.push(`${roleLabel}: ${m.content}`);
  }
  let text = lines.join("\n\n");
  if (text.length > MAX_CHAT_CONTEXT_CHARS) {
    text = text.slice(-MAX_CHAT_CONTEXT_CHARS);
  }
  return text;
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

/**
 * Appends one Tiptap JSON document's blocks to another and returns merged JSON string.
 * 既存の Tiptap JSON に追加分のブロックを結合して JSON 文字列で返す。
 *
 * @param existingContent - Existing editor JSON / 既存のエディタ JSON
 * @param appendedContent - JSON to append / 追記する JSON
 * @returns Merged Tiptap document JSON string / 結合後の JSON 文字列
 */
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

/**
 * Converts markdown to Tiptap JSON and appends it to existing content.
 * Markdown を Tiptap JSON に変換し、既存コンテンツの末尾に追記する。
 */
export function appendMarkdownToTiptapContent(existingContent: string, markdown: string): string {
  return appendTiptapContent(existingContent, convertMarkdownToTiptapContent(markdown));
}

/**
 * Builds a markdown bullet list of suggested wiki link lines (`- [[title]]`).
 * 提案 Wiki リンクの Markdown 箇条書き（`- [[title]]`）を組み立てる。
 */
export function buildSuggestedWikiLinksMarkdown(titles: string[]): string {
  return titles
    .map((title) => title.trim())
    .filter(Boolean)
    .map((title) => `- [[${title}]]`)
    .join("\n");
}

/**
 * Returns suggested wiki titles that are not already linked in the given content.
 * 既存コンテンツにまだ含まれていない提案タイトルのみを返す。
 */
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

/**
 * Resolves @mentions in plain text to referenced pages (longest title match, non-overlapping).
 * プレーン文中の @言及をページに解決する（長いタイトル優先・重複範囲を除外）。
 */
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
