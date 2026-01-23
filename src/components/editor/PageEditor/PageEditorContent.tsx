import React from "react";
import TiptapEditor from "../TiptapEditor";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import { SourceUrlBadge } from "../SourceUrlBadge";
import { LinkedPagesSection } from "@/components/page/LinkedPagesSection";
import Container from "@/components/layout/Container";

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
}) => {
  const isEditorReadOnly = isReadOnly ?? isWikiGenerating;

  return (
    <main className="flex-1 pt-6 pb-32">
      <Container>
          {/* Source URL Badge - クリップしたページの場合に表示 */}
          {sourceUrl && <SourceUrlBadge sourceUrl={sourceUrl} />}

          {/* エディター（生成中はオーバーレイを表示） */}
          <div className="relative">
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
            />
          </div>

          {/* Linked Pages Section */}
          {showLinkedPages && currentPageId && (
            <LinkedPagesSection pageId={currentPageId} />
          )}
      </Container>
    </main>
  );
};
