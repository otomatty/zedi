import { useCallback } from "react";
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
  const { toast } = useToast();

  const handleExportMarkdown = useCallback(() => {
    downloadMarkdown(title, content, sourceUrl);
    toast({
      title: "Markdownファイルをダウンロードしました",
    });
  }, [title, content, sourceUrl, toast]);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      await copyMarkdownToClipboard(title, content, sourceUrl);
      toast({
        title: "Markdownをクリップボードにコピーしました",
      });
    } catch {
      toast({
        title: "コピーに失敗しました",
        variant: "destructive",
      });
    }
  }, [title, content, sourceUrl, toast]);

  return {
    handleExportMarkdown,
    handleCopyMarkdown,
  };
}
