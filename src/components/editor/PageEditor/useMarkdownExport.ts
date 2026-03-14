import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { downloadMarkdown, copyMarkdownToClipboard } from "@/lib/markdownExport";
import { useToast } from "@zedi/ui";

interface UseMarkdownExportReturn {
  handleExportMarkdown: () => void;
  handleCopyMarkdown: () => Promise<void>;
}

/**
 * Hook for markdown export functionality
 */
export function useMarkdownExport(
  title: string,
  content: string,
  sourceUrl?: string | null,
): UseMarkdownExportReturn {
  const { t } = useTranslation();
  const { toast } = useToast();

  const handleExportMarkdown = useCallback(() => {
    downloadMarkdown(title, content, sourceUrl, {
      defaultTitle: t("notes.untitledPage"),
      attributionLabel: t("editor.markdownExport.sourceAttribution"),
    });
    toast({
      title: t("editor.markdownExport.downloaded"),
    });
  }, [title, content, sourceUrl, toast, t]);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      await copyMarkdownToClipboard(title, content, sourceUrl, {
        defaultTitle: t("notes.untitledPage"),
        attributionLabel: t("editor.markdownExport.sourceAttribution"),
      });
      toast({
        title: t("editor.markdownExport.copied"),
      });
    } catch {
      toast({
        title: t("editor.markdownExport.copyFailed"),
        variant: "destructive",
      });
    }
  }, [title, content, sourceUrl, toast, t]);

  return {
    handleExportMarkdown,
    handleCopyMarkdown,
  };
}
