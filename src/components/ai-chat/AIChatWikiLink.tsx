import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@zedi/ui";
import { useWikiLinkNavigation } from "@/components/editor/TiptapEditor/useWikiLinkNavigation";
import { CreatePageDialog } from "@/components/editor/TiptapEditor/CreatePageDialog";
import { usePageStore } from "../../stores/pageStore";
import { WikiLinkPreviewContent } from "../wiki-link/WikiLinkPreviewContent";

interface AIChatWikiLinkProps {
  /** WikiLink title (e.g. from [[Title]]) */
  title: string;
}

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 200;
const LONG_PRESS_MS = 500;

/**
 * AI チャット内の WikiLink をレンダリングする。
 * ホバーでページプレビューを表示し、クリックでページ遷移する。
 * モバイルでは長押しでプレビューを表示する。
 *
 * Renders a clickable WikiLink in AI chat with hover preview.
 * Existing pages link to /page/:id, missing pages render as ghost style.
 * Supports long-press preview on mobile.
 */
export function AIChatWikiLink({ title }: AIChatWikiLinkProps) {
  const normalizedTitle = title.trim();
  const page = usePageStore((state) => state.getPageByTitle(normalizedTitle));
  const referenced = usePageStore(
    (state) => !page && state.ghostLinks.some((gl) => gl.linkText === normalizedTitle),
  );

  const {
    handleLinkClick: navigateWikiLinkByTitle,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  } = useWikiLinkNavigation();

  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number>();
  const preventClickResetTimerRef = useRef<number>();
  const preventClickRef = useRef(false);

  const handleTouchStart = useCallback(() => {
    longPressTimerRef.current = window.setTimeout(() => {
      setIsOpen(true);
      preventClickRef.current = true;
    }, LONG_PRESS_MS);
  }, []);

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    clearTimeout(preventClickResetTimerRef.current);
    preventClickResetTimerRef.current = window.setTimeout(() => {
      preventClickRef.current = false;
    }, 100);
  }, []);

  const handleTouchMove = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
  }, []);

  /** OS ジェスチャ等で touch がキャンセルされたとき long-press が遅延発火しないようクリアする。 */
  const handleTouchCancel = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    clearTimeout(preventClickResetTimerRef.current);
    preventClickRef.current = false;
  }, []);

  const handleAnchorClick = useCallback((e: React.MouseEvent) => {
    if (preventClickRef.current) {
      e.preventDefault();
    }
  }, []);

  const handleCardClick = useCallback(() => {
    setIsOpen(false);
    navigateWikiLinkByTitle(normalizedTitle);
  }, [normalizedTitle, navigateWikiLinkByTitle]);

  const handleGhostTriggerClick = useCallback(
    (e: React.MouseEvent) => {
      if (preventClickRef.current) {
        e.preventDefault();
        return;
      }
      navigateWikiLinkByTitle(normalizedTitle);
    },
    [normalizedTitle, navigateWikiLinkByTitle],
  );

  useEffect(() => {
    return () => {
      clearTimeout(longPressTimerRef.current);
      clearTimeout(preventClickResetTimerRef.current);
    };
  }, []);

  // Close on outside touch and scroll (mobile)
  // モバイルで外部タッチ・スクロール時にカードを閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideTouch = (e: TouchEvent) => {
      if (contentRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    const handleScroll = () => setIsOpen(false);
    const timer = window.setTimeout(() => {
      document.addEventListener("touchstart", handleOutsideTouch);
    }, 100);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("touchstart", handleOutsideTouch);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const touchProps = {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchMove: handleTouchMove,
    onTouchCancel: handleTouchCancel,
  };

  return (
    <HoverCard
      open={isOpen}
      onOpenChange={setIsOpen}
      openDelay={OPEN_DELAY_MS}
      closeDelay={CLOSE_DELAY_MS}
    >
      <HoverCardTrigger asChild>
        {page ? (
          <Link
            to={`/page/${page.id}`}
            className="text-primary decoration-primary/50 hover:decoration-primary rounded px-0.5 font-medium underline underline-offset-2 transition-colors"
            onClick={handleAnchorClick}
            {...touchProps}
          >
            [[{normalizedTitle}]]
          </Link>
        ) : (
          <button
            type="button"
            className="text-muted-foreground decoration-muted-foreground/60 inline cursor-pointer rounded border-0 bg-transparent px-0.5 font-medium underline decoration-dashed underline-offset-2"
            onClick={handleGhostTriggerClick}
            {...touchProps}
          >
            [[{normalizedTitle}]]
          </button>
        )}
      </HoverCardTrigger>
      <HoverCardContent ref={contentRef} className="w-64" side="top" align="start">
        <WikiLinkPreviewContent
          title={normalizedTitle}
          page={page}
          exists={!!page}
          referenced={referenced}
          onClick={handleCardClick}
        />
      </HoverCardContent>
      <CreatePageDialog
        open={createPageDialogOpen}
        pageTitle={pendingCreatePageTitle}
        onConfirm={handleConfirmCreate}
        onCancel={handleCancelCreate}
      />
    </HoverCard>
  );
}
