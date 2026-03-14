/**
 * Web Clipper ダイアログの URL 入力・自動 clip・リセットを管理する hook
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { isValidUrl } from "@/lib/webClipper";

interface UseWebClipperDialogStateOptions {
  clip: (url: string) => Promise<unknown>;
  reset: () => void;
}

export function useWebClipperDialogState({ clip, reset }: UseWebClipperDialogStateOptions) {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const lastClippedUrlRef = useRef<string>("");

  const triggerAutoClip = useDebouncedCallback(
    useCallback(() => {
      const trimmed = url.trim();
      if (!trimmed || !isValidUrl(trimmed)) return;
      if (trimmed === lastClippedUrlRef.current) return;
      lastClippedUrlRef.current = trimmed;
      clip(trimmed);
    }, [url, clip]),
    500,
  );

  useEffect(() => {
    if (!url) {
      lastClippedUrlRef.current = "";
      reset();
    } else if (url !== lastClippedUrlRef.current) {
      reset();
    }
  }, [url, reset]);

  const resetDialogState = useCallback(() => {
    setUrl("");
    setUrlError(null);
    lastClippedUrlRef.current = "";
    reset();
  }, [reset]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text").trim();
      if (text && isValidUrl(text)) {
        e.preventDefault();
        setUrl(text);
        setUrlError(null);
        if (text !== lastClippedUrlRef.current) {
          lastClippedUrlRef.current = text;
          clip(text);
        }
      }
    },
    [clip],
  );

  useEffect(() => {
    triggerAutoClip();
  }, [url, triggerAutoClip]);

  return {
    url,
    setUrl,
    urlError,
    setUrlError,
    lastClippedUrlRef,
    handlePaste,
    resetDialogState,
  };
}
