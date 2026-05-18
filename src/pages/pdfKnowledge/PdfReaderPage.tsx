/**
 * `/sources/:sourceId/pdf` のルートエントリ。
 *
 * Route entry point for `/sources/:sourceId/pdf` — defers to the reader
 * component, which handles platform gating + missing-file UX.
 */
import { PdfReader } from "@/components/pdf-reader/PdfReader";

/**
 * Route element for `/sources/:sourceId/pdf` — thin wrapper around the
 * {@link PdfReader} feature component so the router has a default export.
 * `/sources/:sourceId/pdf` 用の route element。
 */
export default function PdfReaderPage() {
  return <PdfReader />;
}
