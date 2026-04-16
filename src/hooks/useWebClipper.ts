/**
 * Web Clipper フック - URLからWebページを取り込む
 * api を渡すとサーバー側で HTML 取得（CORS 回避）。未指定時は CORS プロキシにフォールバック。
 */
import { useState, useCallback, useRef } from "react";
import { clipWebPage, getClipErrorMessage, type ClippedContent } from "@/lib/webClipper";
import { formatClippedContentAsTiptap } from "@/lib/htmlToTiptap";
import { isYouTubeUrl } from "@/components/editor/utils/urlTransform";
import type { ApiClient } from "@/lib/api/apiClient";

/**
 * Web Clipper のステータス。idle → fetching → extracting → completed | error の順に遷移する。
 * Web Clipper status. Transitions: idle → fetching → extracting → completed | error.
 */
export type WebClipperStatus = "idle" | "fetching" | "extracting" | "completed" | "error";

/**
 * useWebClipper フックのオプション。api 指定時はサーバー側で HTML 取得を優先する。
 * Options for useWebClipper hook. When api is provided, server-side HTML fetch is preferred.
 */
export interface UseWebClipperOptions {
  /** 指定時は POST /api/clip/fetch でサーバー側取得を優先（CORS 回避） */
  api?: ApiClient | null;
}

/**
 * useWebClipper フックの戻り値。status, clippedContent, clip, reset, getTiptapContent を提供する。
 * Return value of useWebClipper hook. Provides status, clippedContent, clip, reset, getTiptapContent.
 */
export interface UseWebClipperReturn {
  status: WebClipperStatus;
  clippedContent: ClippedContent | null;
  error: string | null;
  clip: (url: string) => Promise<ClippedContent | null>;
  reset: () => void;
  getTiptapContent: (
    thumbnailUrl?: string | null,
    storageProviderId?: string | null,
  ) => string | null;
}

/**
 * Web ページクリッピング用カスタムフック。URL から Web ページを取り込み Tiptap JSON に変換する。
 * Custom hook for web page clipping. Fetches a web page from a URL and converts it to Tiptap JSON.
 */
export function useWebClipper(options: UseWebClipperOptions = {}): UseWebClipperReturn {
  const { api } = options;
  const clipIdRef = useRef(0);
  const [status, setStatus] = useState<WebClipperStatus>("idle");
  const [clippedContent, setClippedContent] = useState<ClippedContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHtmlFn = useCallback(
    (url: string) => (api ? api.clipFetchHtml(url) : Promise.reject(new Error("No API"))),
    [api],
  );

  const clip = useCallback(
    async (url: string): Promise<ClippedContent | null> => {
      clipIdRef.current += 1;
      const currentId = clipIdRef.current;

      setStatus("fetching");
      setError(null);
      setClippedContent(null);

      try {
        // YouTube URL の場合は専用サーバーサイドエンドポイントを使用
        // Use dedicated server-side endpoint for YouTube URLs
        if (isYouTubeUrl(url) && api) {
          setStatus("extracting");
          const result = await api.clipYoutube(url);

          if (currentId !== clipIdRef.current) return null;

          const content: ClippedContent = {
            title: result.title,
            content: JSON.stringify(result.tiptapJson),
            textContent: result.contentText,
            excerpt: result.contentText,
            byline: null,
            sourceUrl: result.sourceUrl,
            thumbnailUrl: result.thumbnailUrl,
            siteName: "YouTube",
          };
          setClippedContent(content);
          setStatus("completed");
          return content;
        }

        setStatus("extracting");
        const content = await clipWebPage(url, api ? fetchHtmlFn : undefined);

        if (currentId !== clipIdRef.current) return null;

        setClippedContent(content);
        setStatus("completed");
        return content;
      } catch (err) {
        if (currentId !== clipIdRef.current) return null;

        const errorMessage = getClipErrorMessage(err);
        setError(errorMessage);
        setStatus("error");
        return null;
      }
    },
    [api, fetchHtmlFn],
  );

  const reset = useCallback(() => {
    clipIdRef.current += 1;
    setStatus("idle");
    setClippedContent(null);
    setError(null);
  }, []);

  const getTiptapContent = useCallback(
    (thumbnailUrl?: string | null, storageProviderId?: string | null): string | null => {
      if (!clippedContent) return null;

      // YouTube のコンテンツは既に Tiptap JSON 形式
      // YouTube content is already in Tiptap JSON format
      if (clippedContent.siteName === "YouTube") {
        try {
          // content が既に JSON オブジェクトの文字列かどうかチェック
          // Check if content is already a JSON string
          const parsed = JSON.parse(clippedContent.content);
          if (parsed.type === "doc") {
            return clippedContent.content;
          }
        } catch {
          // JSON パース失敗 — 通常の HTML → Tiptap 変換にフォールバック
          // Parse failure — fall through to normal HTML → Tiptap conversion
        }
      }

      const tiptapDoc = formatClippedContentAsTiptap(
        clippedContent.content,
        clippedContent.sourceUrl,
        clippedContent.siteName,
        thumbnailUrl === undefined ? clippedContent.thumbnailUrl : thumbnailUrl,
        clippedContent.title,
        storageProviderId,
      );

      return JSON.stringify(tiptapDoc);
    },
    [clippedContent],
  );

  return {
    status,
    clippedContent,
    error,
    clip,
    reset,
    getTiptapContent,
  };
}
