/**
 * Web Clipper フック - URLからWebページを取り込む
 */
import { useState, useCallback } from "react";
import {
  clipWebPage,
  getClipErrorMessage,
  type ClippedContent,
} from "@/lib/webClipper";
import { formatClippedContentAsTiptap } from "@/lib/htmlToTiptap";

export type WebClipperStatus =
  | "idle"
  | "fetching"
  | "extracting"
  | "completed"
  | "error";

export interface UseWebClipperReturn {
  status: WebClipperStatus;
  clippedContent: ClippedContent | null;
  error: string | null;
  clip: (url: string) => Promise<ClippedContent | null>;
  reset: () => void;
  getTiptapContent: () => string | null;
}

export function useWebClipper(): UseWebClipperReturn {
  const [status, setStatus] = useState<WebClipperStatus>("idle");
  const [clippedContent, setClippedContent] = useState<ClippedContent | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const clip = useCallback(
    async (url: string): Promise<ClippedContent | null> => {
      setStatus("fetching");
      setError(null);
      setClippedContent(null);

      try {
        // ページを取得
        setStatus("extracting");
        const content = await clipWebPage(url);

        setClippedContent(content);
        setStatus("completed");
        return content;
      } catch (err) {
        const errorMessage = getClipErrorMessage(err);
        setError(errorMessage);
        setStatus("error");
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setClippedContent(null);
    setError(null);
  }, []);

  const getTiptapContent = useCallback((): string | null => {
    if (!clippedContent) return null;

    const tiptapDoc = formatClippedContentAsTiptap(
      clippedContent.content,
      clippedContent.sourceUrl,
      clippedContent.siteName
    );

    return JSON.stringify(tiptapDoc);
  }, [clippedContent]);

  return {
    status,
    clippedContent,
    error,
    clip,
    reset,
    getTiptapContent,
  };
}
