import { sanitizeFilename } from "./markdownExport";

/**
 * Tiptap JSON を HTML 文字列へ変換し、html2pdf.js による PDF 書き出しを行う。
 * `markdownExport.ts` と同じノード dispatch 方式で実装し、エクスポート経路で
 * 重い React Node View 拡張を読み込まずに済むようにしている。
 *
 * Convert Tiptap JSON into HTML and drive html2pdf.js for client-side PDF
 * export. Mirrors the dispatch pattern in `markdownExport.ts` so the
 * export path avoids pulling heavy React node-view extensions.
 */

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
 * Tiptap JSON 文字列を export 用 HTML 文字列へ変換する。
 * 入力が JSON でなければプレーンテキストとみなし、`\n` を段落区切りとして
 * `<p>` ブロックに包んで返す。これにより、読み取り専用パスから渡される
 * Hocuspocus 抽出の `content_text`（ブロック間に `\n` を挟むプレーンテキスト）
 * が PDF 上で 1 行に潰れずに描画される（PR #921 codex P1）。
 *
 * Convert a Tiptap JSON string to an HTML string suitable for PDF export.
 * For non-JSON inputs (e.g. the Y.Doc-extracted `content_text` fed from the
 * read-only path) split on consecutive newlines and emit each chunk as a
 * `<p>` block so paragraphs survive html2canvas rasterisation. Single `\n`
 * inside a chunk becomes `<br />` (PR #921 codex P1).
 */
export function tiptapToHtml(content: string): string {
  if (!content) return "";

  try {
    const doc = JSON.parse(content) as TiptapNode;
    return convertNode(doc);
  } catch {
    return plainTextToHtmlParagraphs(content);
  }
}

/**
 * プレーンテキストを段落 (`<p>`) と改行 (`<br />`) 構造の HTML に変換する。
 * 連続した空行をブロック区切り、単独の `\n` を行内改行として扱う。
 *
 * Convert plain text into a paragraph/`<br>` HTML structure: blank-line runs
 * delimit blocks, single `\n` becomes `<br />` inside a block.
 */
function plainTextToHtmlParagraphs(input: string): string {
  // 改行コードを LF に統一してから、空行区切りでブロックに分割する。
  // Normalise line endings then split on one-or-more blank lines.
  const normalised = input.replace(/\r\n?/g, "\n");
  const blocks = normalised
    .split(/\n{2,}/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.length > 0);
  if (blocks.length === 0) return "";
  return blocks
    .map(
      (block) =>
        `<p>${block
          .split("\n")
          .map((line) => escapeHtml(line))
          .join("<br />")}</p>`,
    )
    .join("");
}

type NodeHandler = (node: TiptapNode) => string;

const nodeHandlers: Record<string, NodeHandler> = {};

function convertNode(node: TiptapNode): string {
  if (!node) return "";
  const handler = nodeHandlers[node.type];
  return handler ? handler(node) : convertChildren(node);
}

function convertChildren(node: TiptapNode): string {
  if (!node.content) return "";
  return node.content.map(convertNode).join("");
}

Object.assign(nodeHandlers, {
  doc: (n) => convertChildren(n),
  paragraph: (n) => `<p>${convertChildren(n)}</p>`,
  heading: (n) => {
    // 本文の見出しは body schema 上 h2–h6。`level` が欠落 / 1 以下の旧データは
    // ページタイトル `h1` と衝突しないよう最小の本文見出し `h2` にフォールバック。
    // Body headings span h2–h6; legacy `level: 1` / missing falls back to `h2`
    // so it never collides with the page-title `h1` (PR #921 gemini medium).
    const rawLevel = n.attrs?.level;
    const level = typeof rawLevel === "number" && rawLevel >= 2 && rawLevel <= 6 ? rawLevel : 2;
    return `<h${level}>${convertChildren(n)}</h${level}>`;
  },
  bulletList: (n) => `<ul>${convertListChildren(n)}</ul>`,
  orderedList: (n) => `<ol>${convertListChildren(n)}</ol>`,
  listItem: (n) => `<li>${convertChildren(n)}</li>`,
  taskList: (n) => `<ul class="task-list">${convertChildren(n)}</ul>`,
  taskItem: (n) => {
    const checked = Boolean(n.attrs?.checked);
    const box = `<input type="checkbox" disabled${checked ? ' checked="checked"' : ""} />`;
    return `<li class="task-list-item">${box} ${convertChildren(n)}</li>`;
  },
  blockquote: (n) => `<blockquote>${convertChildren(n)}</blockquote>`,
  codeBlock: (n) => {
    const language = typeof n.attrs?.language === "string" ? n.attrs.language : "";
    const codeText = collectPlainText(n);
    const langAttr = language ? ` class="language-${escapeHtmlAttr(language)}"` : "";
    return `<pre><code${langAttr}>${escapeHtml(codeText)}</code></pre>`;
  },
  mermaid: (n) => {
    // PDF エクスポートは html2pdf.js / html2canvas で静的レンダリングするため、
    // 実際の SVG を生成するには Mermaid の非同期 API を呼ぶ必要がある。エクスポート
    // 経路を同期に保つ目的で、ここでは Mermaid ソースをコードブロック相当の
    // プレースホルダー (`<pre><code class="language-mermaid">…</code></pre>`) として
    // 出力する。少なくとも図のソースが PDF 上で失われず、必要に応じて後続パスで
    // 事前レンダリングへ差し替えやすい形にしておく（Issue #945）。
    // Render `mermaid` nodes as a `<pre><code class="language-mermaid">` block.
    // Generating a real SVG would require an async call into Mermaid; this
    // exporter is synchronous (html2pdf.js consumes the DOM immediately) so we
    // emit the source verbatim as a placeholder. The diagram source is then
    // preserved in the PDF and can be upgraded to pre-rendered SVG later
    // without touching call sites (Issue #945).
    const code = typeof n.attrs?.code === "string" ? n.attrs.code : "";
    return `<pre><code class="language-mermaid">${escapeHtml(code)}</code></pre>`;
  },
  horizontalRule: () => "<hr />",
  hardBreak: () => "<br />",
  text: (n) => applyMarks(escapeHtml(n.text || ""), n.marks || []),
  wikiLink: (n) => {
    const title = typeof n.attrs?.title === "string" ? n.attrs.title : "";
    return `[[${escapeHtml(title)}]]`;
  },
  image: (n) => {
    const src = typeof n.attrs?.src === "string" ? n.attrs.src : "";
    const alt = typeof n.attrs?.alt === "string" ? n.attrs.alt : "";
    const title = typeof n.attrs?.title === "string" ? n.attrs.title : "";
    const safeSrc = sanitizeUrl(src);
    if (!safeSrc) return "";
    const attrs = [`src="${escapeHtmlAttr(safeSrc)}"`, `alt="${escapeHtmlAttr(alt)}"`];
    if (title) attrs.push(`title="${escapeHtmlAttr(title)}"`);
    return `<img ${attrs.join(" ")} />`;
  },
  youtubeEmbed: (n) => {
    const rawVideoId = n.attrs?.videoId;
    const videoId = typeof rawVideoId === "string" ? rawVideoId.trim() : "";
    // 異常な videoId をそのまま href に入れないよう厳格に検証する。
    // Strictly validate videoId before composing the anchor href.
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return "";
    return `<a href="https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}">YouTube</a>`;
  },
  link: (n) => convertChildren(n),
  // 表組みのフィデリティは print 時に効くので最低限 HTML <table> に落とす。
  // Render tables as real HTML tables so print layout stays usable.
  table: (n) => `<table>${convertChildren(n)}</table>`,
  tableRow: (n) => `<tr>${convertChildren(n)}</tr>`,
  tableCell: (n) => `<td>${convertChildren(n)}</td>`,
  tableHeader: (n) => `<th>${convertChildren(n)}</th>`,
} satisfies Record<string, NodeHandler>);

function convertListChildren(node: TiptapNode): string {
  if (!node.content) return "";
  return node.content.map(convertNode).join("");
}

/**
 * codeBlock のテキストノードはマークを無視して raw 文字列を集める。
 * Collect raw text content of a node tree (used by codeBlock).
 */
function collectPlainText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(collectPlainText).join("");
}

function applyMarks(text: string, marks: TiptapMark[]): string {
  if (!marks || marks.length === 0) return text;
  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        result = `<strong>${result}</strong>`;
        break;
      case "italic":
        result = `<em>${result}</em>`;
        break;
      case "strike":
        result = `<s>${result}</s>`;
        break;
      case "underline":
        result = `<u>${result}</u>`;
        break;
      case "code":
        result = `<code>${result}</code>`;
        break;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        const safeHref = sanitizeUrl(href);
        if (!safeHref) break;
        result = `<a href="${escapeHtmlAttr(safeHref)}">${result}</a>`;
        break;
      }
      // 他の mark（highlight / color など）は print 時の重要度が低いので無視する。
      // Other marks (highlight / color etc.) are dropped for export simplicity.
    }
  }
  return result;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text nodes for safe HTML body insertion. */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** Escape attribute values. Same set as body, but kept as a separate fn for clarity. */
function escapeHtmlAttr(input: string): string {
  return escapeHtml(input);
}

/**
 * 安全な URL スキームだけを許可する。`javascript:` 等をはじいて XSS を防ぐ。
 * Allow only safe URL schemes; strip `javascript:` and friends to prevent XSS.
 */
function sanitizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  // 相対 URL（先頭が `./`・`../`・拡張子付きファイル名・パス断片）を許可する。
  // 文字クラスに `.` を含めることで `image.png` 等のドット入りパスも通す
  // （PR #921 gemini-code-assist high）。
  //
  // Allow relative URLs: `./`, `../`, or a first segment built from
  // alphanumeric / `.` / `_` / `-` characters. Including `.` in the class
  // lets dotted filenames like `image.png` through (PR #921 review).
  if (/^(\.{0,2}\/|[a-zA-Z0-9_.-]+(\/|$))/.test(trimmed)) return trimmed;
  return "";
}

/**
 * PDF エクスポートのオプション。
 * Options for {@link downloadPdf}.
 */
export interface PdfExportOptions {
  /** Default title when the page title is empty. */
  defaultTitle?: string;
  /** Label for the source-attribution block (e.g. "📎 引用元"). */
  attributionLabel?: string;
  /** Page format. Defaults to `"a4"`. */
  format?: "a4" | "letter";
}

/**
 * 引用元ブロックを HTML として組み立てる。`sourceUrl` が空のときは空文字列を返す。
 * Build the source-attribution block. Returns "" when `sourceUrl` is empty.
 */
function buildSourceAttribution(sourceUrl?: string | null, attributionLabel?: string): string {
  if (!sourceUrl?.trim()) return "";
  const safeUrl = sanitizeUrl(sourceUrl.trim());
  if (!safeUrl) return "";
  const label = (attributionLabel?.trim() || "📎 Source") + ":";
  return (
    `<blockquote class="zedi-source">` +
    `${escapeHtml(label)} <a href="${escapeHtmlAttr(safeUrl)}">${escapeHtml(safeUrl)}</a>` +
    `</blockquote>`
  );
}

/**
 * オフスクリーン DOM に組み立てたエクスポート用ルート要素を返す。
 * Compose the offscreen export root used as html2pdf.js source.
 */
function buildExportRoot(html: string): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "zedi-pdf-root";
  root.style.cssText = [
    "position:fixed",
    "left:-99999px",
    "top:0",
    // A4 width at ~96dpi (210mm ≈ 794px). html2canvas captures this width.
    "width:794px",
    "padding:0",
    "background:#fff",
    "color:#111",
    "font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo','Noto Sans JP',system-ui,-apple-system,sans-serif",
    "font-size:14px",
    "line-height:1.7",
  ].join(";");
  root.innerHTML = html;
  return root;
}

/**
 * `downloadPdf` の内部で `html2pdf.js` を遅延 import するための疎結合点。
 * テストで `vi.mock("html2pdf.js")` 経由でモックしやすくしてある。
 *
 * Indirection so tests can `vi.mock("html2pdf.js")` and assert calls without
 * pulling the real library (which depends on canvas / DOM features absent in
 * jsdom).
 */
async function loadHtml2Pdf(): Promise<typeof import("html2pdf.js").default> {
  const mod = await import("html2pdf.js");
  return mod.default;
}

/**
 * ページ本文を PDF として保存する。`tiptapToHtml` で組み立てた HTML を
 * オフスクリーン要素に流し込み、`html2pdf.js`（html2canvas + jsPDF）で
 * 直接ダウンロードを発火する。
 *
 * Save the page body as a PDF. Renders `tiptapToHtml` output into an
 * offscreen element and pipes it through `html2pdf.js` (html2canvas + jsPDF).
 */
export async function downloadPdf(
  title: string,
  content: string,
  sourceUrl?: string | null,
  options?: PdfExportOptions,
): Promise<void> {
  const { defaultTitle = "Untitled", attributionLabel, format = "a4" } = options ?? {};
  const normalizedTitle = title.trim();
  const bodyHtml = tiptapToHtml(content);
  const attributionHtml = buildSourceAttribution(sourceUrl, attributionLabel);
  const titleHtml = normalizedTitle
    ? `<h1 style="margin:0 0 16px 0;font-size:24px;">${escapeHtml(normalizedTitle)}</h1>`
    : "";

  // 上下左右の余白は CSS padding に寄せず、jsPDF の `margin` で管理する。
  // Manage margins via jsPDF options rather than CSS to keep page breaks predictable.
  const root = buildExportRoot(`${titleHtml}${attributionHtml}${bodyHtml}`);
  document.body.appendChild(root);

  try {
    const html2pdf = await loadHtml2Pdf();
    const filename = sanitizeFilename(normalizedTitle || defaultTitle) + ".pdf";
    // `pagebreak` は html2pdf.js v0.10+ の実機能だが、同梱の `.d.ts` には未定義。
    // また `html2pdf()` のオーバーロード解決の都合で戻り値が
    // `Html2PdfWorker | Promise<void>` のユニオンに見えるため、ここで
    // `unknown` 経由のキャストで最小限の構造的型に寄せる。
    //
    // `pagebreak` is supported at runtime since html2pdf.js v0.10 but is not
    // in the bundled `.d.ts`. The `html2pdf()` overload resolution also widens
    // the return type to a union, so we narrow it through `unknown` to a
    // chainable worker that matches what the library exposes at runtime.
    const opts = {
      filename,
      margin: [12, 12, 16, 12] as [number, number, number, number],
      image: { type: "jpeg" as const, quality: 0.95 },
      enableLinks: true,
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format, orientation: "portrait" as const },
      pagebreak: { mode: ["css", "legacy"], avoid: ["pre", "table", "img", "blockquote"] },
    };

    interface Html2PdfChain {
      set(options: typeof opts): Html2PdfChain;
      from(src: HTMLElement): Html2PdfChain;
      save(): Promise<void>;
    }
    const worker = html2pdf() as unknown as Html2PdfChain;
    await worker.set(opts).from(root).save();
  } finally {
    root.remove();
  }
}
