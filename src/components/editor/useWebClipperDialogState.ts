import { useState, useEffect, useCallback, useRef } from "react";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { isValidUrl } from "@/lib/webClipper";

/** Hook のオプション / Hook options */
interface UseWebClipperDialogStateOptions {
  /** URL を受け取り clip 処理を行う関数 / Function that receives URL and performs clip */
  clip: (url: string) => Promise<unknown>;
  /** 既存コンテンツをリセットする関数 / Function to reset existing content */
  reset: () => void;
}

/**
 * Web Clipper ダイアログの URL 入力・自動 clip・リセットを管理する hook。
 * Manages URL input, auto-clip, and reset for the Web Clipper dialog.
 *
 * @remarks
 * - URL の入力・ペースト時にバリデーションを行い、有効な URL のみ clip を実行する。
 *   Validates on input/paste and clips only valid URLs.
 * - 入力変更後 500ms のデバウンスで自動 clip する。
 *   Auto-clips after 500ms debounce on input change.
 * - URL が空になった場合や変更時に reset を呼び出して既存コンテンツをクリアする。
 *   Clears existing content via reset when URL becomes empty or changes.
 * - ペースト時は即座に clip を実行する（デバウンスなし）。
 *   Paste triggers immediate clip (no debounce).
 *
 * @param options - hook の設定 / Hook configuration
 * @param options.clip - URL を受け取り clip 処理を行う関数 / Function that receives URL and performs clip
 * @param options.reset - 既存コンテンツをリセットする関数 / Function to reset existing content
 *
 * @returns ダイアログ UI が使う state とハンドラ / State and handlers for dialog UI
 *
 * @example
 * ```tsx
 * const {
 *   url, setUrl,
 *   handlePaste, resetDialogState, clearLastClippedUrl
 * } = useWebClipperDialogState({ clip: doClip, reset: clearContent });
 * ```
 */
export function useWebClipperDialogState({ clip, reset }: UseWebClipperDialogStateOptions) {
  const [url, setUrl] = useState("");
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
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      lastClippedUrlRef.current = "";
      reset();
    } else if (normalizedUrl !== lastClippedUrlRef.current) {
      reset();
    }
  }, [url, reset]);

  /**
   * エラー時に lastClippedUrl をリセットし、再クリップを許可する。
   * Clears the last clipped URL so a retry is allowed (e.g. after clip failure).
   */
  const clearLastClippedUrl = useCallback(() => {
    lastClippedUrlRef.current = "";
  }, []);

  const resetDialogState = useCallback(() => {
    setUrl("");
    lastClippedUrlRef.current = "";
    reset();
  }, [reset]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text").trim();
      if (text && isValidUrl(text)) {
        e.preventDefault();
        setUrl(text);
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

  /**
   * 現在の URL が最後にクリップした URL と一致するか判定する。
   * Returns whether the current URL matches the last successfully clipped URL.
   */
  const isCurrentUrlClipped = useCallback(() => {
    const trimmed = url.trim();
    return trimmed !== "" && trimmed === lastClippedUrlRef.current;
  }, [url]);

  return {
    url,
    setUrl,
    handlePaste,
    resetDialogState,
    clearLastClippedUrl,
    isCurrentUrlClipped,
  };
}
