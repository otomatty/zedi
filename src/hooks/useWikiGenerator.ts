// Wiki Generator フック - ストリーミング生成を管理

import { useState, useCallback, useRef } from "react";
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
}

export function useWikiGenerator(): UseWikiGeneratorReturn {
  const [status, setStatus] = useState<WikiGeneratorStatus>("idle");
  const [streamedContent, setStreamedContent] = useState("");
  const [result, setResult] = useState<WikiGeneratorResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

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
  };
}
