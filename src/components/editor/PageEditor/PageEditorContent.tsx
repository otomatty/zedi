import React, { useRef, useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import TiptapEditor from "../TiptapEditor";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import { SourceUrlBadge } from "../SourceUrlBadge";
import { LinkedPagesSection } from "@/components/page/LinkedPagesSection";
import Container from "@/components/layout/Container";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";
import { PageTitleBlock } from "./PageTitleBlock";
import { StickyTitleBar } from "./StickyTitleBar";

interface PageEditorContentProps {
  content: string;
  title: string;
  sourceUrl?: string;
  currentPageId: string | null;
  pageId: string;
  isNewPage: boolean;
  isWikiGenerating: boolean;
  isReadOnly?: boolean;
  showLinkedPages?: boolean;
  showToolbar?: boolean;
  onContentChange: (content: string) => void;
  onContentError: (error: ContentError | null) => void;
  /** 編集可能時のみ。タイトル変更コールバック */
  onTitleChange?: (value: string) => void;
  /** タイトルバリデーションエラー（例: 重複） */
  errorMessage?: string | null;
  /** 省略可。StickyTitleBar と PageTitleBlock で使う ref */
  titleRef?: React.RefObject<HTMLElement | null>;
  /** リアルタイムコラボレーション（有効時のみ渡す）。ydoc 準備前に表示するローディング用 */
  collaboration?: UseCollaborationReturn;
}

/**
 * Main content area of PageEditor
 * Contains the TiptapEditor, SourceUrlBadge, and LinkedPagesSection
 */
export const PageEditorContent: React.FC<PageEditorContentProps> = ({
  content,
  title,
  sourceUrl,
  currentPageId,
  pageId,
  isNewPage,
  isWikiGenerating,
  isReadOnly,
  showLinkedPages = true,
  showToolbar = true,
  onContentChange,
  onContentError,
  onTitleChange,
  errorMessage = null,
  titleRef: titleRefFromParent,
  collaboration,
}) => {
  const isEditorReadOnly = isReadOnly ?? isWikiGenerating;

  const titleBlockRef = useRef<HTMLElement | null>(null);
  const [isTitleInView, setIsTitleInView] = useState(true);

  const setTitleRef = useCallback(
    (el: HTMLElement | null) => {
      (titleBlockRef as React.MutableRefObject<HTMLElement | null>).current = el;
      if (titleRefFromParent && "current" in titleRefFromParent) {
        (titleRefFromParent as React.MutableRefObject<HTMLElement | null>).current = el;
      }
    },
    [titleRefFromParent]
  );

  useEffect(() => {
    const el = titleBlockRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsTitleInView(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToTitle = useCallback(() => {
    titleBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // local モード（個人ページ）は awareness 不要。collaborative モードのみ awareness 必須。
  const useCollaborationMode =
    Boolean(collaboration?.ydoc && collaboration?.xmlFragment && collaboration?.collaborationUser);

  const collaborationConfig =
    useCollaborationMode && collaboration
      ? {
          ydoc: collaboration.ydoc!,
          xmlFragment: collaboration.xmlFragment!,
          awareness: collaboration.awareness, // undefined in local mode
          user: collaboration.collaborationUser!,
          updateCursor: collaboration.updateCursor,
          updateSelection: collaboration.updateSelection,
        }
      : undefined;

  return (
    <main className="flex-1 pt-6 pb-32">
      <StickyTitleBar
        visible={!isTitleInView}
        title={title}
        onClick={scrollToTitle}
      />
      <Container>
          {/* ページタイトル（コンテンツ上部） */}
          <PageTitleBlock
            title={title}
            onTitleChange={onTitleChange}
            isReadOnly={isEditorReadOnly}
            errorMessage={errorMessage}
            titleRef={setTitleRef}
          />
          {/* Source URL Badge - クリップしたページの場合に表示 */}
          {sourceUrl && <SourceUrlBadge sourceUrl={sourceUrl} />}

          {/* エディター（生成中はオーバーレイを表示） */}
          <div className="relative">
            {collaboration && !useCollaborationMode && (
              <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">リアルタイム編集を準備中...</span>
              </div>
            )}
            {(useCollaborationMode || !collaboration) && (
              <>
                {isWikiGenerating && (
                  <div className="absolute inset-0 bg-background/30 pointer-events-none z-10 rounded-md" />
                )}
                <TiptapEditor
                  content={content}
                  onChange={onContentChange}
                  autoFocus={isNewPage}
                  className="min-h-[calc(100vh-200px)]"
                  pageId={currentPageId || pageId || undefined}
                  pageTitle={title}
                  isReadOnly={isEditorReadOnly}
                  showToolbar={showToolbar}
                  onContentError={onContentError}
                  collaborationConfig={collaborationConfig}
                />
              </>
            )}
          </div>

          {/* Linked Pages Section */}
          {showLinkedPages && currentPageId && (
            <LinkedPagesSection pageId={currentPageId} />
          )}
      </Container>
    </main>
  );
};
