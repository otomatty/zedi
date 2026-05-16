/**
 * 与えられた `sourceId` の PDF をローカルから読み込み、pdf.js でパースするフック。
 *
 * Loads a registered PDF via the Tauri bridge (`readPdfBytes`) and feeds the
 * bytes through {@link getPdfDocument}. Returns the resulting `PDFDocumentProxy`
 * plus loading / error state.
 *
 * 重要 / Important:
 *  - 1 つの `sourceId` に対し doc は 1 度だけロードされる（依存配列で制御）。
 *  - アンマウント時は doc の破棄を行い、内部 worker への参照を解放する。
 *  - The document is loaded exactly once per `sourceId`; on unmount we call
 *    `pdfDoc.destroy()` to release the worker reference.
 */
import { useEffect, useRef, useState } from "react";
import { readPdfBytes, PdfKnowledgeUnsupportedError } from "@/lib/pdfKnowledge/tauriBridge";
import { isTauriDesktop } from "@/lib/platform";
import { getPdfDocument, type PdfDocumentProxy } from "@/lib/pdfKnowledge/pdfjsLoader";

/** Return shape of {@link usePdfDocument}. */
export interface UsePdfDocumentResult {
  /** Parsed PDF document, or `null` while loading / on error / on web. */
  pdfDoc: PdfDocumentProxy | null;
  /** True while bytes are being read or pdf.js is parsing. */
  isLoading: boolean;
  /** Error from either the Tauri bridge or pdf.js, if any. */
  error: Error | null;
}

/**
 * Phase 1 では Web 環境では PDF を読まない（`PdfReaderUnsupported` で別 UI を出す前提）。
 * On the web build the hook stays inert: callers must gate the entire viewer
 * with `isTauriDesktop()`.
 */
export function usePdfDocument(sourceId: string | undefined): UsePdfDocumentResult {
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  // Track the latest doc so the cleanup effect can destroy it.
  // 最新の doc をクリーンアップ時に破棄するため ref で保持。
  const docRef = useRef<PdfDocumentProxy | null>(null);

  useEffect(() => {
    if (!sourceId || !isTauriDesktop()) {
      setPdfDoc(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setPdfDoc(null);

    (async () => {
      try {
        const bytes = await readPdfBytes(sourceId);
        if (cancelled) return;
        const doc = await getPdfDocument(bytes);
        if (cancelled) {
          // Lost the race: dispose immediately.
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setPdfDoc(doc);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof PdfKnowledgeUnsupportedError) {
          // Shouldn't happen behind the isTauriDesktop gate, but stay quiet.
          setError(null);
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Dispose whichever doc was bound here; setting docRef = null first
      // avoids double-destroy in Strict Mode.
      const current = docRef.current;
      docRef.current = null;
      if (current) {
        void current.destroy();
      }
    };
  }, [sourceId]);

  return { pdfDoc, isLoading, error };
}
