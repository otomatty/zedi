import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@zedi/ui";
import { useWikiLinkNavigation } from "@/components/editor/TiptapEditor/useWikiLinkNavigation";
import { CreatePageDialog } from "@/components/editor/TiptapEditor/CreatePageDialog";
import { usePageByTitle, useGhostLinkReferenced } from "@/hooks/pages/usePageQueries";
import { WikiLinkPreviewContent } from "../wikiLink/WikiLinkPreviewContent";

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
 * Existing pages link to `/notes/:noteId/:pageId`, missing pages render as
 * ghost style (Issue #889 Phase 3 で `/pages/:id` を撤去)。
 * Supports long-press preview on mobile.
 */
export function AIChatWikiLink({ title }: AIChatWikiLinkProps) {
  const normalizedTitle = title.trim();
  // 旧ゲストストア (`pageStore`) は Issue #1020 で廃止したため、リポジトリ
  // （IndexedDB）ベースのクエリでページ解決とゴースト参照判定を行う。
  // The legacy guest store (`pageStore`) was retired by issue #1020; resolve
  // the page and the ghost-reference state via the repository (IndexedDB).
  const { data: resolvedPage } = usePageByTitle(normalizedTitle);
  const page = resolvedPage ?? undefined;
  const { data: ghostReferenced = false } = useGhostLinkReferenced(normalizedTitle);
  const referenced = !page && ghostReferenced;

  const {
    handleLinkClick: navigateWikiLinkByTitle,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  } = useWikiLinkNavigation();

  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | undefined>(undefined);
  const preventClickResetTimerRef = useRef<number | undefined>(undefined);
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

  /**
   * OS ジェスチャ等で touch がキャンセルされたとき long-press が遅延発火しないようクリアする。
   * Clears long-press timers when touch is cancelled (e.g. OS gestures) so the card does not open late.
   */
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
      // Issue #931: Cmd/Ctrl+クリックは新タブ意図として渡す。`<button>` は
      // ネイティブリンクではないので、修飾キーの判定はここで行う。
      // Issue #931: forward Cmd/Ctrl+click as a new-tab intent. The ghost
      // trigger is a `<button>` rather than an anchor, so the browser does
      // not honor modifier keys for us — we detect them explicitly.
      const newTab = e.metaKey || e.ctrlKey;
      navigateWikiLinkByTitle(normalizedTitle, { newTab });
    },
    [normalizedTitle, navigateWikiLinkByTitle],
  );

  // Issue #931: 中クリック（button === 1）も新タブ扱い。`<button>` 要素は
  // 中クリックで `click` イベントを発火しないため `onAuxClick` で受ける。
  // Issue #931: middle-click on the ghost trigger should also open in a new
  // tab. `<button>` does not fire `click` for the middle button, so we hook
  // `onAuxClick`.
  const handleGhostTriggerAuxClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 1) return;
      if (preventClickRef.current) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      navigateWikiLinkByTitle(normalizedTitle, { newTab: true });
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
            // Issue #889 Phase 3: `/pages/:id` は撤去済みのため、所属ノート配下の
            // canonical URL に遷移する。`Page.noteId` は Issue #823 / #825 以降
            // non-null。
            // Issue #889 Phase 3: route to `/notes/:noteId/:pageId` since the
            // standalone `/pages/:id` route was retired. `Page.noteId` is
            // non-null after Issues #823 / #825.
            to={`/notes/${page.noteId}/${page.id}`}
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
            onAuxClick={handleGhostTriggerAuxClick}
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
