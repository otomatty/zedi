import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import type { PendingChatPageGenerationState } from "@/types/chatPageGeneration";
import { convertMarkdownToTiptapContent } from "@/lib/markdownToTiptap";
import { generateWikiContentFromChatOutlineStream } from "@/lib/wikiGenerator";

/** Throttle interval (ms) for streaming Markdown → Tiptap JSON in the editor. / ストリーム更新のスロットル */
const PENDING_CHAT_PAGE_STREAM_THROTTLE_MS = 150;

/** Inputs for {@link usePendingChatPageGeneration}. */
export interface UsePendingChatPageGenerationOptions {
  /** Active page id in the editor. */
  currentPageId: string | null;
  /** Editor state has loaded page metadata. */
  isInitialized: boolean;
  /** Page title for the generation prompt. */
  title: string;
  setContent: (content: string) => void;
  setWikiContentForCollab: (content: string | null) => void;
  saveChanges: (title: string, content: string) => void;
  toast: (opts: { title: string; variant?: "destructive" }) => void;
}

/**
 * When navigating from AI chat after creating a page, streams full Markdown into the editor
 * from outline + conversation (second-stage generation).
 * AIチャットからの新規ページ作成後、本文をストリーミング生成してエディタに反映する。
 */
export function usePendingChatPageGeneration({
  currentPageId,
  isInitialized,
  title,
  setContent,
  setWikiContentForCollab,
  saveChanges,
  toast,
}: UsePendingChatPageGenerationOptions): void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  /** Payload copied from router before state is cleared. / navigate で消す前に退避 */
  const pendingPayloadRef = useRef<PendingChatPageGenerationState | null>(null);
  /** Pathname when that payload was captured (ignore if user navigates away). / 取り込み時のパス（別ルートへ移動したら破棄） */
  const pendingCapturePathnameRef = useRef<string | null>(null);
  /** Prevents duplicate runs for the same outline + conversation. / 同一内容の二重生成を防ぐ */
  const startedKeyRef = useRef<string | null>(null);
  const lastPageIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const raw = location.state as {
      pendingChatPageGeneration?: PendingChatPageGenerationState;
    } | null;
    const p = raw?.pendingChatPageGeneration;
    if (p) {
      pendingPayloadRef.current = p;
      pendingCapturePathnameRef.current = location.pathname;
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (currentPageId && currentPageId !== lastPageIdRef.current) {
      startedKeyRef.current = null;
      lastPageIdRef.current = currentPageId;
    }

    if (
      pendingCapturePathnameRef.current !== null &&
      location.pathname !== pendingCapturePathnameRef.current
    ) {
      pendingPayloadRef.current = null;
      pendingCapturePathnameRef.current = null;
    }

    const pending = pendingPayloadRef.current;
    if (!pending || !currentPageId || !isInitialized || !title?.trim()) {
      return;
    }

    const dedupeKey = `${currentPageId}:${pending.outline}\n${pending.conversationText}`;
    if (startedKeyRef.current === dedupeKey) {
      return;
    }
    startedKeyRef.current = dedupeKey;

    let markdown = "";
    let throttleId: ReturnType<typeof setTimeout> | null = null;
    const ac = new AbortController();

    const pathnameAtStart = location.pathname;

    const clearRouterPendingState = () => {
      navigate(pathnameAtStart, { replace: true, state: null });
    };

    const flushThrottled = () => {
      if (throttleId) clearTimeout(throttleId);
      throttleId = setTimeout(() => {
        const tiptap = convertMarkdownToTiptapContent(markdown);
        setContent(tiptap);
        setWikiContentForCollab(tiptap);
      }, PENDING_CHAT_PAGE_STREAM_THROTTLE_MS);
    };

    void generateWikiContentFromChatOutlineStream(
      title,
      pending.outline,
      pending.conversationText,
      {
        onChunk: (chunk) => {
          markdown += chunk;
          flushThrottled();
        },
        onComplete: (result) => {
          if (throttleId) clearTimeout(throttleId);
          const tiptap = convertMarkdownToTiptapContent(result.content);
          setContent(tiptap);
          setWikiContentForCollab(tiptap);
          saveChanges(title, tiptap);
          clearRouterPendingState();
          toast({ title: t("aiChat.notifications.pageBodyGenerated") });
        },
        onError: (err) => {
          if (throttleId) clearTimeout(throttleId);
          clearRouterPendingState();
          if (err.message !== "ABORTED") {
            toast({
              title: t("aiChat.notifications.pageBodyGenerateFailed"),
              variant: "destructive",
            });
          }
        },
      },
      ac.signal,
    );

    return () => {
      ac.abort();
      if (throttleId) clearTimeout(throttleId);
    };
  }, [
    location.pathname,
    currentPageId,
    isInitialized,
    title,
    navigate,
    setContent,
    setWikiContentForCollab,
    saveChanges,
    toast,
    t,
  ]);
}
