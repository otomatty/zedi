import { useCallback } from "react";
import {
  downloadMarkdown,
  copyMarkdownToClipboard,
} from "@/lib/markdownExport";
import { useToast } from "@/hooks/use-toast";

interface UseMarkdownExportReturn {
  handleExportMarkdown: () => void;
  handleCopyMarkdown: () => Promise<void>;
}

/**
 * Hook for markdown export functionality
 */
export function useMarkdownExport(
  title: string,
  content: string
): UseMarkdownExportReturn {
  const { toast } = useToast();

  const handleExportMarkdown = useCallback(() => {
    downloadMarkdown(title, content);
    toast({
      title: "Markdownファイルをダウンロードしました",
    });
  }, [title, content, toast]);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      await copyMarkdownToClipboard(title, content);
      toast({
        title: "Markdownをクリップボードにコピーしました",
      });
    } catch (error) {
      toast({
        title: "コピーに失敗しました",
        variant: "destructive",
      });
    }
  }, [title, content, toast]);

  return {
    handleExportMarkdown,
    handleCopyMarkdown,
  };
}
