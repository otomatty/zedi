// Tesseract.js を用いたクライアントサイド OCR ラッパー
// Client-side OCR wrapper using tesseract.js.
//
// 実装メモ / Implementation notes:
// - `tesseract.js` は WASM + Web Worker ベース。初回実行時に学習データ (langs) をダウンロードする。
//   `tesseract.js` uses WASM + Web Worker; the language data is downloaded on first use.
// - メインバンドルから切り離すため、動的 import() で読み込む。
//   We dynamic-import the library so it is split out of the main bundle.

import type { Worker } from "tesseract.js";

/**
 * OCR 実行時のオプション
 * Options for {@link runOcr}.
 */
export interface OcrOptions {
  /**
   * 進捗率 (0-100)。学習データ DL / 認識の双方にまたがる。
   * Progress percentage (0-100) across loading and recognition.
   */
  onProgress?: (percent: number) => void;
  /**
   * OCR で使用する Tesseract 言語コード。未指定時は {@link detectOcrLanguages} で自動選択。
   * Language codes passed to Tesseract. Falls back to {@link detectOcrLanguages}.
   */
  languages?: string[];
  /**
   * ダイアログ close 時など、処理を中断するための signal。
   * AbortSignal used to cancel in-flight OCR (e.g. when the dialog is closed).
   */
  signal?: AbortSignal;
}

/**
 * UI ロケールから OCR で読み込む言語リストを決定する。
 * Determine which Tesseract language(s) to load based on the UI locale.
 *
 * 日本語ロケールでは jpn + eng、それ以外は eng のみ。
 * Japanese locales use jpn + eng; everything else falls back to eng only.
 */
export function detectOcrLanguages(uiLanguage: string | undefined): string[] {
  if (typeof uiLanguage === "string" && uiLanguage.toLowerCase().startsWith("ja")) {
    return ["jpn", "eng"];
  }
  return ["eng"];
}

/**
 * 画像ファイルから OCR でテキストを抽出する。
 * Extract text from an image file via OCR.
 *
 * @param file 対象の画像 File / Image file to OCR.
 * @param options 進捗/言語/abort の制御 / Progress, language, and abort controls.
 * @returns 抽出されたテキスト / Extracted text.
 */
export async function runOcr(file: File, options: OcrOptions = {}): Promise<string> {
  const { onProgress, languages, signal } = options;

  if (signal?.aborted) {
    throw new DOMException("OCR aborted", "AbortError");
  }

  const langs = languages && languages.length > 0 ? languages : ["eng"];

  // 動的 import でメインバンドルから分離 / Dynamic import keeps this out of the main bundle.
  const { createWorker, OEM } = await import("tesseract.js");

  const worker: Worker = await createWorker(langs, OEM.LSTM_ONLY, {
    logger: (m: { status: string; progress: number }) => {
      // `progress` は各フェーズ (言語 DL / 初期化 / 認識) ごとに 0→1 にリセットされるため、
      // UI がガタつかないよう認識フェーズのみを通知対象とする。
      // `progress` resets per phase (language load / init / recognize); only surface the
      // recognition phase to avoid the progress bar jumping back to 0%.
      if (m?.status !== "recognizing text") return;
      if (typeof m?.progress === "number" && onProgress) {
        onProgress(Math.round(Math.max(0, Math.min(1, m.progress)) * 100));
      }
    },
  });

  // abort された場合は worker を止めて AbortError を throw する。
  // If aborted we terminate the worker and throw AbortError.
  const onAbort = () => {
    void worker.terminate();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (signal?.aborted) {
      throw new DOMException("OCR aborted", "AbortError");
    }
    const result = await worker.recognize(file);
    if (signal?.aborted) {
      throw new DOMException("OCR aborted", "AbortError");
    }
    return result.data.text;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      await worker.terminate();
    } catch {
      // 既に abort で terminate 済みの場合があるため握りつぶす
      // Swallow: may already be terminated via the abort listener above.
    }
  }
}
