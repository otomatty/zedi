import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { downloadPdf } from "@/lib/tiptapToHtml";

/**
 * `usePdfExport` の戻り値。Markdown エクスポート系フックと同じ形でハンドラだけを返す。
 * Return type of {@link usePdfExport}. Matches the shape of the Markdown export
 * hooks (handlers only) so menu wiring stays symmetric.
 */
interface UsePdfExportReturn {
  handleExportPdf: () => Promise<void>;
}

/**
 * ページエディタの「PDFで出力」アクションを駆動するフック。クライアント側で
 * Tiptap JSON を HTML 化し、html2pdf.js で PDF をダウンロードする。成功 /
 * 失敗時にはトーストを発火する。
 *
 * Hook that drives the page editor's "Export PDF" action. Converts Tiptap
 * JSON to HTML in the browser and triggers an html2pdf.js download. Emits a
 * success or destructive toast depending on the outcome.
 */
export function usePdfExport(
  title: string,
  content: string,
  sourceUrl?: string | null,
): UsePdfExportReturn {
  const { t } = useTranslation();
  const { toast } = useToast();

  const handleExportPdf = useCallback(async () => {
    try {
      await downloadPdf(title, content, sourceUrl, {
        defaultTitle: t("notes.untitledPage"),
        attributionLabel: t("editor.pdfExport.sourceAttribution"),
      });
      toast({ title: t("editor.pdfExport.downloaded") });
    } catch {
      toast({
        title: t("editor.pdfExport.failed"),
        variant: "destructive",
      });
    }
  }, [title, content, sourceUrl, toast, t]);

  return { handleExportPdf };
}
