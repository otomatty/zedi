/**
 * sanitizeHtml の DOMPurify 設定。
 * DOMPurify configuration for sanitizeHtml.
 *
 * ホワイトリスト方式で許可するタグ・属性を定義する。
 * ここに含まれないタグ・属性はすべて除去される。
 * Defines allowlists for tags and attributes; anything not listed is stripped.
 */

/**
 * Web Clipper で保持するタグのホワイトリスト。
 * Allowlist of tags retained for clipped web content.
 */
export const ALLOWED_TAGS = [
  // 見出し / Headings
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",

  // ブロック / Block
  "p",
  "br",
  "hr",
  "blockquote",
  "pre",
  "code",

  // リスト / Lists
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",

  // リンク・画像 / Links & images
  "a",
  "img",
  "figure",
  "figcaption",
  "picture",
  "source",

  // テーブル / Tables
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",

  // インライン書式 / Inline formatting
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "small",
  "sub",
  "sup",
  "abbr",
  "cite",
  "q",
  "dfn",
  "time",
  "var",
  "kbd",
  "samp",
  "span",

  // セクション / Sections
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "nav",
  "main",
  "details",
  "summary",

  // ルビ / Ruby
  "ruby",
  "rt",
  "rp",

  // その他 / Misc
  "wbr",

  // メディア / Media
  // NOTE: `autoplay` 属性は ALLOWED_ATTR に含めないこと。
  //       メディア自動再生による UX 悪化・セキュリティリスクを防止する。
  // NOTE: Do NOT add `autoplay` to ALLOWED_ATTR.
  //       Prevents UX degradation and security risks from auto-playing media.
  "video",
  "audio",
] as const;

/**
 * 許可する属性のホワイトリスト。
 * Allowlist of attributes retained for clipped web content.
 */
export const ALLOWED_ATTR = [
  // リンク・画像 / Links & images
  "href",
  "src",
  "alt",
  "title",
  "srcset",
  "sizes",
  "loading",
  "decoding",

  // レイアウト / Layout
  "width",
  "height",
  "class",
  "id",

  // 国際化 / i18n
  "lang",
  "dir",

  // テーブル / Tables
  "colspan",
  "rowspan",
  "scope",
  "headers",

  // セマンティック / Semantic
  "datetime",
  "cite",

  // メディア / Media
  "poster",
  "controls",
  "preload",
  "type",
  "media",
] as const;
