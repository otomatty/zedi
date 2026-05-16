/**
 * `pdfjs-dist` を Vite + Tauri 環境で安全に読み込むためのローダ。
 *
 * Lazy initialiser for `pdfjs-dist` that wires the worker via Vite's `?url`
 * import (the only worker setup officially supported by pdf.js that resolves
 * correctly in both `vite dev` and the packaged Tauri production bundle).
 *
 * 重要 / Important:
 *  - PDF バイナリは Tauri IPC 経由でローカルから取得した `Uint8Array` のみを渡す。
 *    URL は一切渡さない（CDN / outbound network を踏ませない）。
 *  - PDF binaries are only ever supplied as `Uint8Array` from the Tauri bridge.
 *    No URL / CDN paths are constructed here — the data never leaves the
 *    desktop.
 *
 *  - CMaps / 標準フォントは `scripts/copy-pdfjs-assets.mjs` が `public/pdfjs/`
 *    にミラーリングするので、`/pdfjs/cmaps/` と `/pdfjs/standard_fonts/` という
 *    leading-slash 絶対パスで参照する。
 *  - CMaps and standard fonts are mirrored to `public/pdfjs/` by the prebuild
 *    script and referenced by leading-slash absolute URLs.
 */
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

/** `pdfjs-dist` の `getDocument` 戻り値の型エイリアス。Type alias for the `pdfjs-dist` `getDocument` return type. */
export type PdfDocumentProxy = pdfjsLib.PDFDocumentProxy;
/** `pdfjs-dist` の `PDFPageProxy` の型エイリアス。Type alias for the `pdfjs-dist` `PDFPageProxy` type. */
export type PdfPageProxy = pdfjsLib.PDFPageProxy;
/** `pdfjs-dist` の `PageViewport` の型エイリアス。Type alias for the `pdfjs-dist` `PageViewport` type. */
export type PdfPageViewport = pdfjsLib.PageViewport;

/**
 * `public/pdfjs/cmaps/` の絶対 URL。CJK PDF を描画する際に pdf.js が fetch する。
 * Absolute URL for the CMap directory served from the bundled webroot.
 */
export const CMAP_URL = "/pdfjs/cmaps/" as const;

/**
 * `public/pdfjs/standard_fonts/` の絶対 URL。標準フォント (Helvetica 互換) を
 * 埋め込まない PDF を描画するために必要。
 * Absolute URL for the standard fonts directory served from the bundled webroot.
 */
export const STANDARD_FONT_DATA_URL = "/pdfjs/standard_fonts/" as const;

let workerConfigured = false;

/**
 * モジュール初回利用時に一度だけ worker をセットアップする。
 * Configure the pdf.js worker exactly once per module load.
 */
function ensureWorkerConfigured(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  workerConfigured = true;
}

/**
 * `pdfjsLib.getDocument` の薄いラッパ。worker 設定とアセット URL を一元化する。
 *
 * Thin wrapper around `pdfjsLib.getDocument` that ensures the worker is wired
 * up exactly once and that CMap / standard-font URLs are always supplied.
 *
 * @param data - PDF のバイト列 (Tauri ブリッジ経由で取得済み)。
 *   PDF byte array obtained via the Tauri bridge.
 * @returns ロード済み document の Promise。Promise of the loaded document.
 */
export function getPdfDocument(data: Uint8Array): Promise<PdfDocumentProxy> {
  ensureWorkerConfigured();
  return pdfjsLib.getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    // Workers are configured globally; using a fresh task per call is fine.
  }).promise;
}

/**
 * 直接 `pdfjs-dist` を呼びたい呼び出し側のために、初期化済みの名前空間を再エクスポートする。
 * Re-export the configured `pdfjs-dist` namespace for callers that need direct
 * access to types like `PageViewport`, `RenderingCancelledException`, etc.
 */
export { pdfjsLib };
