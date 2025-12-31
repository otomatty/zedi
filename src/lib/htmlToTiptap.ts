/**
 * HTML を Tiptap JSON 形式に変換
 */
import { generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

// Tiptap の拡張機能（TiptapEditorと同じ構成にする）
const extensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
  }),
  Link.configure({
    openOnClick: false,
  }),
];

/**
 * HTMLをTiptap JSON形式に変換
 */
export function htmlToTiptapJSON(html: string): object {
  // 不要なタグを除去
  const cleanHtml = cleanupHtml(html);

  // Tiptap JSON に変換
  try {
    return generateJSON(cleanHtml, extensions);
  } catch (error) {
    console.error("Failed to convert HTML to Tiptap JSON:", error);
    // フォールバック: プレーンテキストとして処理
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: stripHtml(html),
            },
          ],
        },
      ],
    };
  }
}

/**
 * HTMLをクリーンアップ
 */
function cleanupHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

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

  // 連続する空白を整理
  return div.innerHTML.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
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
      child.textContent?.trim() ||
      child.querySelector("img, video, iframe, hr, br");
    if (!hasContent && child.children.length === 0) {
      child.remove();
    }
  }
}

/**
 * HTMLタグを除去してプレーンテキストを取得
 */
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

/**
 * Tiptap JSONを文字列に変換
 */
export function tiptapJSONToString(json: object): string {
  return JSON.stringify(json);
}

/**
 * クリップしたコンテンツをTiptap JSONとして整形
 * - 引用元情報を含めたフォーマット
 */
export function formatClippedContentAsTiptap(
  content: string,
  sourceUrl: string,
  siteName?: string | null
): object {
  const mainContent = htmlToTiptapJSON(content);

  // 引用元の表示用テキスト
  const sourceText = siteName ? `${siteName}` : new URL(sourceUrl).hostname;

  // 引用元情報を先頭に追加
  const sourceInfo = {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "📎 引用元: ",
      },
      {
        type: "text",
        marks: [
          {
            type: "link",
            attrs: {
              href: sourceUrl,
              target: "_blank",
              rel: "noopener noreferrer nofollow",
              class: null,
            },
          },
        ],
        text: sourceText,
      },
    ],
  };

  // 区切り線
  const horizontalRule = {
    type: "horizontalRule",
  };

  // コンテンツを結合
  const docContent = mainContent as { type: string; content?: unknown[] };
  const existingContent = docContent.content || [];

  return {
    type: "doc",
    content: [sourceInfo, horizontalRule, ...existingContent],
  };
}
