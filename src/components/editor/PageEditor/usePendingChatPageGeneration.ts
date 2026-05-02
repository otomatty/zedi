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

  /** Latest title / i18n for stream callbacks (effect deps omit `title` to avoid abort on edits). / タイトル編集で effect が再実行されないよう参照で渡す */
  const titleRef = useRef(title);
  const tRef = useRef(t);

  useLayoutEffect(() => {
    titleRef.current = title;
    tRef.current = t;
  }, [title, t]);

  /** Payload copied from router before state is cleared. / navigate で消す前に退避 */
  const pendingPayloadRef = useRef<PendingChatPageGenerationState | null>(null);
  /** `pathname+search+hash` when that payload was captured (ignore if user navigates away). / 取り込み時の URL（別ルートへ移動したら破棄） */
  const pendingCaptureLocationKeyRef = useRef<string | null>(null);
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
      pendingCaptureLocationKeyRef.current = `${location.pathname}${location.search}${location.hash}`;
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, state: null },
      );
    }
  }, [location.state, location.pathname, location.search, location.hash, navigate]);

  /**
   * True once the page has a non-empty title — generation effect depends on this instead of `title`
   * so keystrokes do not re-run the effect. / タイトルが非空になったら真。キー入力で effect が再実行されないよう `title` 本体は依存に含めない。
   */
  const titleReady = Boolean(title?.trim());

  useEffect(() => {
    if (currentPageId && currentPageId !== lastPageIdRef.current) {
      startedKeyRef.current = null;
      lastPageIdRef.current = currentPageId;
    }

    const locationKey = `${location.pathname}${location.search}${location.hash}`;
    if (
      pendingCaptureLocationKeyRef.current !== null &&
      locationKey !== pendingCaptureLocationKeyRef.current
    ) {
      pendingPayloadRef.current = null;
      pendingCaptureLocationKeyRef.current = null;
    }

    const pending = pendingPayloadRef.current;
    if (!pending || !currentPageId || !isInitialized || !titleReady) {
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
    const searchAtStart = location.search;
    const hashAtStart = location.hash;

    const clearRouterPendingState = () => {
      navigate(
        { pathname: pathnameAtStart, search: searchAtStart, hash: hashAtStart },
        { replace: true, state: null },
      );
    };

    const flushThrottled = () => {
      if (throttleId) return;
      throttleId = setTimeout(() => {
        throttleId = null;
        // AI 出力経路。先頭の `# Title` 行はタイトル input と重複するため落とす（issue #784）。
        // AI path: drop a stray leading `# Title` line that duplicates the title input (issue #784).
        const tiptap = convertMarkdownToTiptapContent(markdown, { dropLeadingH1: true });
        setContent(tiptap);
        setWikiContentForCollab(tiptap);
      }, PENDING_CHAT_PAGE_STREAM_THROTTLE_MS);
    };

    void generateWikiContentFromChatOutlineStream(
      titleRef.current,
      pending.outline,
      pending.conversationText,
      {
        onChunk: (chunk) => {
          markdown += chunk;
          flushThrottled();
        },
        onComplete: (result) => {
          if (throttleId) clearTimeout(throttleId);
          throttleId = null;
          // 同上、AI 出力なので先頭 `# Title` を落とす（issue #784）。
          // Same as above: AI output, drop a leading `# Title` (issue #784).
          const tiptap = convertMarkdownToTiptapContent(result.content, { dropLeadingH1: true });
          setContent(tiptap);
          setWikiContentForCollab(tiptap);
          saveChanges(titleRef.current, tiptap);
          clearRouterPendingState();
          toast({ title: tRef.current("aiChat.notifications.pageBodyGenerated") });
        },
        onError: (err) => {
          if (throttleId) clearTimeout(throttleId);
          throttleId = null;
          clearRouterPendingState();
          if (err.message !== "ABORTED") {
            toast({
              title: tRef.current("aiChat.notifications.pageBodyGenerateFailed"),
              variant: "destructive",
            });
          }
        },
      },
      ac.signal,
      pending.userSchema,
    );

    return () => {
      ac.abort();
      if (throttleId) clearTimeout(throttleId);
    };
  }, [
    location.pathname,
    location.search,
    location.hash,
    currentPageId,
    isInitialized,
    titleReady,
    navigate,
    setContent,
    setWikiContentForCollab,
    saveChanges,
    toast,
  ]);
}
