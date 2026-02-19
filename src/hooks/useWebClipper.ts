/**
 * Web Clipper フック - URLからWebページを取り込む
 * api を渡すとサーバー側で HTML 取得（CORS 回避）。未指定時は CORS プロキシにフォールバック。
 */
import { useState, useCallback } from "react";
import {
  clipWebPage,
  getClipErrorMessage,
  type ClippedContent,
} from "@/lib/webClipper";
import { formatClippedContentAsTiptap } from "@/lib/htmlToTiptap";
import type { ApiClient } from "@/lib/api/apiClient";

export type WebClipperStatus =
  | "idle"
  | "fetching"
  | "extracting"
  | "completed"
  | "error";

export interface UseWebClipperOptions {
  /** 指定時は POST /api/clip/fetch でサーバー側取得を優先（CORS 回避） */
  api?: ApiClient | null;
}

export interface UseWebClipperReturn {
  status: WebClipperStatus;
  clippedContent: ClippedContent | null;
  error: string | null;
  clip: (url: string) => Promise<ClippedContent | null>;
  reset: () => void;
  getTiptapContent: () => string | null;
}

export function useWebClipper(options: UseWebClipperOptions = {}): UseWebClipperReturn {
  const { api } = options;
  const [status, setStatus] = useState<WebClipperStatus>("idle");
  const [clippedContent, setClippedContent] = useState<ClippedContent | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const fetchHtmlFn = useCallback(
    (url: string) => (api ? api.clipFetchHtml(url) : Promise.reject(new Error("No API"))),
    [api]
  );

  const clip = useCallback(
    async (url: string): Promise<ClippedContent | null> => {
      setStatus("fetching");
      setError(null);
      setClippedContent(null);

      try {
        setStatus("extracting");
        const content = await clipWebPage(url, api ? fetchHtmlFn : undefined);

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
    [api, fetchHtmlFn]
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
