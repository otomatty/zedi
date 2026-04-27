/**
 * HTML を Tiptap JSON 形式に変換
 */
import { generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

/**
 * Link の `isAllowedUri` はエディタ（`editorConfig.ts`）と同じ方針で、
 * クリップ結果のリンクがエディタで拒否されないよう揃える。
 * Keep aligned with `createEditorExtensions` Link XSS rules.
 */
function isClipLinkUriAllowed(url: string | undefined): boolean {
  const value = (url ?? "").trim();
  if (!value) return false;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^(mailto|tel):/i.test(value)) return true;
  return false;
}

// Web クリップ用の最小スキーマ（サーバー `clipAndCreate` と同系）。
// Table / TaskList 等は含めない — 拡張は別 PR で検討する。
// generateJSON に Image がないと <img> がドロップされる。
// 外部 HTML の `<h1>`〜`<h3>` をパース時にドロップしないため、ここでは server 側
// (`server/api/src/lib/articleExtractor.ts`) と同じ `[1, 2, 3]` を維持する。
// 取り込み後の正規化（h1 → h2）はエディタ装着時の `HeadingLevelClamp` と
// `sanitizeTiptapContent` が行う（PR #777）。
// Keep parsing levels aligned with the server extractor so external `<h1>`〜`<h3>` survive
// `generateJSON`; client/runtime clamping (HeadingLevelClamp + sanitizeTiptapContent) demotes
// any level-1 headings to level 2 before they reach the editor body.
const extensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
    codeBlock: false,
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    isAllowedUri: isClipLinkUriAllowed,
  }),
  Image,
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
 * 空の要素を再帰的に削除。
 * `VOID_LIKE_KEEP_TAGS` は cleanupHtml の `unwantedSelectors` で既に除去される
 * video / iframe / input 等は含めない（純粋な自己完結タグのみ）。
 */
const VOID_LIKE_KEEP_TAGS = new Set(["IMG", "HR", "BR", "SOURCE"]);

function removeEmptyElements(element: Element): void {
  const children = Array.from(element.children);

  for (const child of children) {
    removeEmptyElements(child);

    // 子を持たないが自己完結コンテンツとなる要素は削除しない（img 等）
    if (VOID_LIKE_KEEP_TAGS.has(child.tagName)) continue;

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
  _sourceUrl: string,
  _siteName?: string | null,
  thumbnailUrl?: string | null,
  title?: string | null,
  storageProviderId?: string | null,
): JSONContent {
  // sourceUrl / siteName は将来の拡張用に引数として残す
  // Keep in signature for future use (e.g. attribution)
  void _sourceUrl;
  void _siteName;

  const mainContent = htmlToTiptapJSON(content);
  const baseContent = mainContent.content ?? [];

  const trimmedThumbnail = thumbnailUrl?.trim();
  const imageNode: JSONContent | null = trimmedThumbnail
    ? {
        type: "image",
        attrs: {
          src: trimmedThumbnail,
          alt: title || "OGP thumbnail",
          ...(storageProviderId && { storageProviderId }),
        },
      }
    : null;

  const contentNodes: JSONContent[] = imageNode ? [imageNode, ...baseContent] : baseContent;

  return {
    type: "doc",
    content: contentNodes,
  };
}
