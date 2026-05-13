/**
 * PDF ハイライトから派生 Zedi ページを作る際の **テンプレート生成**ロジック。
 * Template generator for the Zedi page produced from a PDF highlight.
 *
 * Phase 1 のデフォルトは Excerpt-centric: 1 ハイライト → 1 ページ。
 * ページ本文は以下の構成を持つ:
 *   1. 引用ブロック (blockquote) — ハイライト本文。"不変な素材"を視認可能に。
 *   2. 出典行 — `From: \<filename\> p.\<n\>` を PDF ビューアへのディープリンクとして
 *      貼る。Zedi の「出典トレース」原則に従う。
 *   3. 空の段落 — ユーザーが自分の言葉で書き始めるためのカーソル位置。
 *
 * Phase 1 default is excerpt-centric (1 highlight → 1 page). The body has:
 *   1. blockquote of the highlight text (immutable raw material)
 *   2. citation paragraph linking back to the PDF reader at the correct page
 *   3. an empty paragraph so the cursor lands on a writable line
 */

/**
 * 派生ページのタイトル生成に使う入力。
 * Input for {@link buildDerivedPageTitle}.
 */
export interface BuildDerivedPageTitleInput {
  /** ハイライト本文。Highlight body text. */
  highlightText: string;
  /** ソースの表示名（PDF ファイル名）。Source display name (PDF filename). */
  displayName?: string;
}

/** タイトル最大長。Tiptap のページタイトル列に合わせて 80 文字。Max title length. */
const TITLE_MAX_LENGTH = 80;

/**
 * 派生ページのデフォルトタイトルを組み立てる。
 * Build a default title for the derived page.
 *
 * 規則 / Rules:
 *  1. `highlightText` が空でなければ、先頭から最大 80 文字を、空白圧縮と末尾の句読点除去して返す。
 *  2. `highlightText` が空で `displayName` があるならそれを返す。
 *  3. どちらも無ければ汎用ラベルを返す。
 */
export function buildDerivedPageTitle(input: BuildDerivedPageTitleInput): string {
  const collapsed = input.highlightText.replace(/\s+/g, " ").trim();
  if (collapsed) {
    const truncated =
      collapsed.length > TITLE_MAX_LENGTH
        ? `${collapsed.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
        : collapsed;
    // 末尾の句読点を 1 文字だけ落とす（カット位置で切れた "." や "、" がタイトルに残る違和感を回避）
    // Drop a single trailing punctuation mark so a selection cut mid-sentence
    // does not bleed into the title.
    return truncated.replace(/[.,。、!?！？:;：；]$/u, "");
  }
  if (input.displayName?.trim()) return input.displayName.trim();
  return "Untitled PDF excerpt";
}

/**
 * 派生ページから元 PDF のページにジャンプするためのディープリンクを組み立てる。
 * Build the deep-link URL that opens the PDF reader at the highlight's page.
 *
 * 形式は `/sources/<sourceId>/pdf#page=<pdfPage>`。フラグメントは
 * PDF.js の URL fragment convention に合わせている。
 * Format `/sources/<sourceId>/pdf#page=<pdfPage>`; the fragment follows the
 * PDF.js URL fragment convention.
 */
export function buildPdfSourceDeepLink(params: { sourceId: string; pdfPage: number }): string {
  return `/sources/${encodeURIComponent(params.sourceId)}/pdf#page=${params.pdfPage}`;
}

/**
 * 派生ページ生成のための入力。
 * Input for {@link buildDerivedPageTemplate}.
 */
export interface BuildDerivedPageTemplateInput {
  /** 親 PDF ソースの ID。Owning PDF source id. */
  sourceId: string;
  /** 1 始まりの PDF ページ番号。1-indexed PDF page number. */
  pdfPage: number;
  /** ハイライト本文。Highlight body text. */
  text: string;
  /** ソースの表示名。Display name shown in the citation line. */
  displayName?: string;
}

/**
 * 派生 Zedi ページ用の Tiptap JSON ドキュメントを文字列で返す。
 * Returns the Tiptap JSON document (stringified) for a derived Zedi page.
 *
 * @returns `pages.content` 列に直接書き込める JSON 文字列。
 *   A JSON string ready to be persisted into the `pages.content` column.
 */
export function buildDerivedPageTemplate(input: BuildDerivedPageTemplateInput): string {
  const displayName = input.displayName?.trim() || "PDF";
  const href = buildPdfSourceDeepLink({ sourceId: input.sourceId, pdfPage: input.pdfPage });

  const doc = {
    type: "doc",
    content: [
      // 1. 引用ブロック: ハイライト本文を不変な素材として残す。
      // 1. Blockquote: the highlight body kept as immutable raw material.
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: input.text }],
          },
        ],
      },
      // 2. 出典行: "From: <displayName>, p.<pdfPage>" を PDF へディープリンク。
      // 2. Citation line — links back to the PDF reader at the right page.
      {
        type: "paragraph",
        content: [
          { type: "text", text: "From: " },
          {
            type: "text",
            text: `${displayName}, p.${input.pdfPage}`,
            marks: [
              {
                type: "link",
                attrs: { href, target: "_self", rel: "noopener noreferrer" },
              },
            ],
          },
        ],
      },
      // 3. 空の段落: ユーザーがここから書き始める。
      // 3. Empty paragraph where the user starts writing.
      { type: "paragraph" },
    ],
  };

  return JSON.stringify(doc);
}
