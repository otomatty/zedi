/**
 * HTML を Tiptap JSON 形式に変換
 */
import { generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

// Tiptap の拡張機能（TiptapEditorと同じ構成にする）
const extensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
    codeBlock: false,
  }),
  Link.configure({
    openOnClick: false,
  }),
  CodeBlockLowlight.configure({
    lowlight,
    defaultLanguage: null,
  }),
];

/**
 * HTMLをTiptap JSON形式に変換
 */
export function htmlToTiptapJSON(html: string): JSONContent {
  const cleanHtml = cleanupHtml(html);

  try {
    return generateJSON(cleanHtml, extensions) as JSONContent;
  } catch (error) {
    console.error("Failed to convert HTML to Tiptap JSON:", error);
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: stripHtml(html) }],
        },
      ],
    };
  }
}

/**
 * HTMLをクリーンアップ
 * <pre> 内の改行・インデントは保持する（プレースホルダーで退避してから空白整理）
 * DOMParser を使用して安全にパースする（パース中にスクリプト等は実行されないが、
 * XSS対策のための完全なサニタイズは呼び出し元で別途行う必要がある）
 */
function cleanupHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const div = doc.body;

  // <pre> 内の内容を退避（空白整理で崩れないように）
  const preElements = Array.from(div.querySelectorAll("pre"));
  const prePlaceholders = new Map<string, string>();
  preElements.forEach((pre) => {
    const placeholder = `__PRE_${crypto.randomUUID()}__`;
    prePlaceholders.set(placeholder, pre.outerHTML);
    pre.insertAdjacentHTML("beforebegin", placeholder);
    pre.remove();
  });

  // 不要な要素を削除
  const unwantedSelectors = [
    "script",
    "style",
    "noscript",
    "iframe",
    "object",
    "embed",
    "svg",
    "canvas",
    "video",
    "audio",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "nav",
    "footer",
    "aside",
    ".advertisement",
    ".ad",
    ".social-share",
    ".comments",
    "[aria-hidden='true']",
  ];

  unwantedSelectors.forEach((selector) => {
    try {
      const elements = div.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    } catch {
      // セレクタが無効な場合はスキップ
    }
  });

  // 空の要素を削除
  removeEmptyElements(div);

  // 連続する空白を整理（<pre> は退避済みなのでコードの改行は保持される）
  let result = div.innerHTML.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();

  // <pre> 内容を復元
  for (const [placeholder, originalHtml] of prePlaceholders) {
    result = result.replace(placeholder, originalHtml);
  }
  return result;
}

/**
 * 空の要素を再帰的に削除
 */
function removeEmptyElements(element: Element): void {
  const children = Array.from(element.children);

  for (const child of children) {
    removeEmptyElements(child);

    // テキストコンテンツが空で、子要素もない場合は削除
    const hasContent =
      child.textContent?.trim() || child.querySelector("img, video, iframe, hr, br");
    if (!hasContent && child.children.length === 0) {
      child.remove();
    }
  }
}

/**
 * HTMLタグを除去してプレーンテキストを取得
 * DOMParser を使用して XSS を防ぐ
 */
function stripHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

/**
 * Tiptap JSONを文字列に変換
 */
export function tiptapJSONToString(json: JSONContent): string {
  return JSON.stringify(json);
}

/**
 * クリップしたコンテンツをTiptap JSONとして整形
 * 引用元表示は PageEditorContent の SourceUrlBadge が担当
 */
export function formatClippedContentAsTiptap(
  content: string,
  sourceUrl: string,
  siteName?: string | null,
  thumbnailUrl?: string | null,
  title?: string | null,
): JSONContent {
  void sourceUrl;
  void siteName;

  const mainContent = htmlToTiptapJSON(content);
  const baseContent = mainContent.content ?? [];

  const trimmedThumbnail = thumbnailUrl?.trim();
  const imageNode: JSONContent | null = trimmedThumbnail
    ? {
        type: "image",
        attrs: { src: trimmedThumbnail, alt: title || "OGP thumbnail" },
      }
    : null;

  const contentNodes: JSONContent[] = imageNode ? [imageNode, ...baseContent] : baseContent;

  return {
    type: "doc",
    content: contentNodes,
  };
}
