/**
 * Web Clipper フック - URLからWebページを取り込む
 * api を渡すとサーバー側で HTML 取得（CORS 回避）。未指定時は CORS プロキシにフォールバック。
 */
import { useState, useCallback, useRef } from "react";
import { clipWebPage, getClipErrorMessage, type ClippedContent } from "@/lib/webClipper";
import { formatClippedContentAsTiptap } from "@/lib/htmlToTiptap";
import { isYouTubeUrl } from "@/components/editor/utils/urlTransform";
import { getDefaultAISettings, loadAISettings } from "@/lib/aiSettings";
import type { ApiClient } from "@/lib/api/apiClient";
import type { AIProviderType, AISettings } from "@/types/ai";

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

type YouTubeClipOptions = { provider?: AIProviderType; model?: string };

function resolveYouTubeClipOptions(aiSettings: AISettings | null): YouTubeClipOptions {
  const settings = aiSettings ?? getDefaultAISettings();
  const apiMode = settings.apiMode ?? "api_server";
  const isSupportedProvider =
    settings.provider === "openai" ||
    settings.provider === "anthropic" ||
    settings.provider === "google";

  if (!isSupportedProvider) {
    return {};
  }

  if (apiMode !== "api_server" && !settings.isConfigured) {
    return {};
  }

  const modelId = settings.modelId || `${settings.provider}:${settings.model}`;
  if (!modelId) {
    return {};
  }

  return {
    provider: settings.provider,
    model: modelId,
  };
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
        // ユーザーの AI 設定を読み込み、AI 要約を有効化する
        // Use dedicated server-side endpoint for YouTube URLs
        // Load user AI settings to enable AI summary generation
        if (isYouTubeUrl(url) && api) {
          setStatus("extracting");

          // AI 要約用の provider/model を取得（設定済みの場合のみ）
          // Fetch provider/model for AI summary (only if configured)
          // direct-API プロバイダー (openai/anthropic/google) のみ対応
          // claude-code は iframe ベースなので対象外
          // Only direct-API providers (openai/anthropic/google) are supported
          // claude-code is iframe-based so excluded
          let aiOptions: YouTubeClipOptions = {};
          try {
            aiOptions = resolveYouTubeClipOptions(await loadAISettings());
          } catch {
            // AI 設定の読み込み失敗は非致命的（要約なしで続行）
            // AI settings load failure is non-fatal (continue without summary)
          }

          const result = await api.clipYoutube(url, aiOptions);

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
