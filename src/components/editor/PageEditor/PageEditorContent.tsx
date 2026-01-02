import React from "react";
import TiptapEditor from "../TiptapEditor";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import { SourceUrlBadge } from "../SourceUrlBadge";
import { LinkedPagesSection } from "@/components/page/LinkedPagesSection";
import Container from "@/components/layout/Container";

interface PageEditorContentProps {
  content: string;
  sourceUrl?: string;
  currentPageId: string | null;
  pageId: string;
  isNewPage: boolean;
  isWikiGenerating: boolean;
  onContentChange: (content: string) => void;
  onContentError: (error: ContentError | null) => void;
}

/**
 * Main content area of PageEditor
 * Contains the TiptapEditor, SourceUrlBadge, and LinkedPagesSection
 */
export const PageEditorContent: React.FC<PageEditorContentProps> = ({
  content,
  sourceUrl,
  currentPageId,
  pageId,
  isNewPage,
  isWikiGenerating,
  onContentChange,
  onContentError,
}) => {
  return (
    <main className="flex-1 py-6">
      <Container>
        <div className="max-w-4xl mx-auto space-y-4">
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
              isReadOnly={isWikiGenerating}
              onContentError={onContentError}
            />
          </div>

          {/* Linked Pages Section */}
          {currentPageId && <LinkedPagesSection pageId={currentPageId} />}
        </div>
      </Container>
    </main>
  );
};
