import React, { useRef, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import TiptapEditor from "../TiptapEditor";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";
import type { CollaborationConfig } from "../TiptapEditor/types";
import { SourceUrlBadge } from "../SourceUrlBadge";
import { WikiGeneratorButton } from "../WikiGeneratorButton";
import { LinkedPagesSection } from "@/components/page/LinkedPagesSection";
import Container from "@/components/layout/Container";
import { isContentNotEmpty } from "@/lib/contentUtils";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";
import type { WikiGeneratorStatus } from "./types";
import { PageTitleBlock } from "./PageTitleBlock";

function getCollaborationState(collaboration: UseCollaborationReturn | undefined): {
  useCollaborationMode: boolean;
  collaborationConfig: CollaborationConfig | undefined;
} {
  const ready = Boolean(
    collaboration?.ydoc && collaboration?.xmlFragment && collaboration?.collaborationUser,
  );
  if (!ready || !collaboration) {
    return { useCollaborationMode: false, collaborationConfig: undefined };
  }
  const config: CollaborationConfig = {
    ydoc: collaboration.ydoc,
    xmlFragment: collaboration.xmlFragment,
    awareness: collaboration.awareness,
    user: collaboration.collaborationUser,
    updateCursor: collaboration.updateCursor,
    updateSelection: collaboration.updateSelection,
  };
  return { useCollaborationMode: true, collaborationConfig: config };
}

interface PageEditorContentProps {
  content: string;
  title: string;
  sourceUrl?: string;
  currentPageId: string | null;
  pageId: string;
  isNewPage: boolean;
  isWikiGenerating: boolean;
  isReadOnly?: boolean;
  isSyncingLinks?: boolean;
  showLinkedPages?: boolean;
  showToolbar?: boolean;
  onContentChange: (content: string) => void;
  onContentError: (error: ContentError | null) => void;
  /** 編集可能時のみ。タイトル変更コールバック */
  onTitleChange?: (value: string) => void;
  /** タイトルバリデーションエラー（例: 重複） */
  errorMessage?: string | null;
  /** リアルタイムコラボレーション（有効時のみ渡す）。ydoc 準備前に表示するローディング用 */
  collaboration?: UseCollaborationReturn;
  /** URL から作成時など、Y.Doc が空のときに一度だけ反映する Tiptap JSON 文字列 */
  initialContent?: string;
  /** initialContent をエディタに反映したあとに呼ぶ */
  onInitialContentApplied?: () => void;
  /** Wiki 生成ステータス */
  wikiStatus?: WikiGeneratorStatus;
  /** Wiki 生成コールバック */
  onGenerateWiki?: () => void;
  /** コラボモード時、Wiki生成内容を Y.Doc に反映する用。反映後に onWikiContentApplied でクリア */
  wikiContentForCollab?: string | null;
  onWikiContentApplied?: () => void;
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
  isSyncingLinks = false,
  showLinkedPages = true,
  showToolbar = true,
  onContentChange,
  onContentError,
  onTitleChange,
  errorMessage = null,
  collaboration,
  initialContent,
  onInitialContentApplied,
  wikiStatus,
  onGenerateWiki,
  wikiContentForCollab = null,
  onWikiContentApplied,
}) => {
  const isEditorReadOnly = isReadOnly ?? isWikiGenerating;
  const hasContent = useMemo(() => isContentNotEmpty(content), [content]);

  const contentFocusRef = useRef<(() => void) | null>(null);
  const focusContent = useCallback(() => {
    contentFocusRef.current?.();
  }, []);

  const { useCollaborationMode, collaborationConfig } = getCollaborationState(collaboration);
  const showCollaborationLoading = Boolean(collaboration && !useCollaborationMode);
  const showEditor = useCollaborationMode || !collaboration;

  return (
    <main className="flex-1 pt-6 pb-32">
      <Container>
        {/* ページタイトルと Wiki 生成ボタン（同一行） */}
        <div className="flex items-start gap-3 pt-6 pb-2">
          <div className="min-w-0 flex-1">
            <PageTitleBlock
              title={title}
              onTitleChange={onTitleChange}
              isReadOnly={isEditorReadOnly}
              errorMessage={errorMessage}
              onEnterMoveToContent={!isEditorReadOnly ? focusContent : undefined}
            />
          </div>
          {wikiStatus && onGenerateWiki && (
            <div className="shrink-0">
              <WikiGeneratorButton
                title={title}
                hasContent={hasContent}
                onGenerate={onGenerateWiki}
                status={wikiStatus}
              />
            </div>
          )}
        </div>

        {/* Source URL Badge - クリップしたページの場合に表示 */}
        {sourceUrl && <SourceUrlBadge sourceUrl={sourceUrl} />}

        {/* エディター（生成中はオーバーレイを表示） */}
        <div className="relative">
          {showCollaborationLoading && (
            <div className="text-muted-foreground flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">リアルタイム編集を準備中...</span>
            </div>
          )}
          {showEditor && (
            <>
              <TiptapEditor
                content={content}
                onChange={onContentChange}
                autoFocus={isNewPage}
                className="min-h-[calc(100vh-200px)]"
                pageId={currentPageId || pageId || undefined}
                pageTitle={title}
                isReadOnly={isEditorReadOnly}
                isWikiGenerating={isWikiGenerating}
                showToolbar={showToolbar}
                onContentError={onContentError}
                collaborationConfig={collaborationConfig}
                focusContentRef={contentFocusRef}
                initialContent={initialContent}
                onInitialContentApplied={onInitialContentApplied}
                wikiContentForCollab={wikiContentForCollab ?? undefined}
                onWikiContentApplied={onWikiContentApplied}
              />
            </>
          )}
        </div>

        {/* Linked Pages Section */}
        {showLinkedPages && currentPageId && (
          <LinkedPagesSection pageId={currentPageId} isSyncingLinks={isSyncingLinks} />
        )}
      </Container>
    </main>
  );
};
