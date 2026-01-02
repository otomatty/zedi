// Wiki Generator フック - ストリーミング生成を管理

import { useState, useCallback, useRef, useEffect } from "react";
import {
  generateWikiContentStream,
  WikiGeneratorResult,
  convertMarkdownToTiptapContent,
} from "@/lib/wikiGenerator";

export type WikiGeneratorStatus =
  | "idle"
  | "generating"
  | "completed"
  | "error"
  | "cancelled";

export interface UseWikiGeneratorReturn {
  status: WikiGeneratorStatus;
  streamedContent: string;
  result: WikiGeneratorResult | null;
  error: Error | null;
  generate: (title: string) => void;
  cancel: () => void;
  reset: () => void;
  getTiptapContent: () => string | null;
  /** スロットリングされたTiptapコンテンツ（エディター直接更新用） */
  throttledTiptapContent: string | null;
}

/** スロットリング間隔（ミリ秒） */
const THROTTLE_INTERVAL_MS = 150;

export function useWikiGenerator(): UseWikiGeneratorReturn {
  const [status, setStatus] = useState<WikiGeneratorStatus>("idle");
  const [streamedContent, setStreamedContent] = useState("");
  const [result, setResult] = useState<WikiGeneratorResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [throttledTiptapContent, setThrottledTiptapContent] = useState<
    string | null
  >(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // スロットリング: streamedContentの変更を一定間隔でTiptap形式に変換
  useEffect(() => {
    if (status !== "generating" || !streamedContent) {
      return;
    }

    const timer = setTimeout(() => {
      const tiptapContent = convertMarkdownToTiptapContent(streamedContent);
      setThrottledTiptapContent(tiptapContent);
    }, THROTTLE_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [streamedContent, status]);

  const generate = useCallback((title: string) => {
    // 既存の生成をキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 状態をリセット
    setStatus("generating");
    setStreamedContent("");
    setResult(null);
    setError(null);

    // 新しいAbortControllerを作成
    abortControllerRef.current = new AbortController();

    generateWikiContentStream(
      title,
      {
        onChunk: (chunk) => {
          setStreamedContent((prev) => prev + chunk);
        },
        onComplete: (generatedResult) => {
          setResult(generatedResult);
          setStatus("completed");
          abortControllerRef.current = null;
        },
        onError: (err) => {
          if (err.message === "ABORTED") {
            setStatus("cancelled");
          } else {
            setError(err);
            setStatus("error");
          }
          abortControllerRef.current = null;
        },
      },
      abortControllerRef.current.signal
    );
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStatus("cancelled");
    }
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("idle");
    setStreamedContent("");
    setResult(null);
    setError(null);
    setThrottledTiptapContent(null);
  }, []);

  const getTiptapContent = useCallback((): string | null => {
    if (result) {
      return convertMarkdownToTiptapContent(result.content);
    }
    if (streamedContent) {
      return convertMarkdownToTiptapContent(streamedContent);
    }
    return null;
  }, [result, streamedContent]);

  return {
    status,
    streamedContent,
    result,
    error,
    generate,
    cancel,
    reset,
    getTiptapContent,
    throttledTiptapContent,
  };
}
