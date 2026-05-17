import React, { useRef, useCallback, useMemo } from "react";
import type { MutableRefObject } from "react";
import { Loader2 } from "lucide-react";
import TiptapEditor from "@/components/editor/TiptapEditor";
import type { ContentError } from "@/components/editor/TiptapEditor/useContentSanitizer";
import type { CollaborationConfig } from "@/components/editor/TiptapEditor/types";
import { SourceUrlBadge } from "@/components/editor/SourceUrlBadge";
import { WikiGeneratorButton } from "@/components/editor/WikiGeneratorButton";
import { LinkedPagesSection } from "@/components/page/LinkedPagesSection";
import { LintSuggestions } from "@/components/page/LintSuggestions";
import Container from "@/components/layout/Container";
import { isContentNotEmpty } from "@/lib/contentUtils";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";
import type { WikiGeneratorStatus } from "@/hooks/useWikiGenerator";
import { PageTitleBlock } from "./PageTitleBlock";

/**
 * `useCollaboration` の戻り値から、Tiptap に渡す collaborationConfig と
 * 編集可否ゲートに使うフラグを導出する。Issue #880 で初期同期完了
 * (`isSynced`) を編集可否条件に取り込んだ。
 *
 * Derive both the `CollaborationConfig` for Tiptap and the gating flags used
 * to lock editing during the initial Hocuspocus/IDB merge. Issue #880 added
 * `isInitialSyncPending` so the body editor stays unmounted while a remote
 * Y.Doc is still being merged, preventing the user from typing into an empty
 * doc that will be overwritten by the upcoming sync.
 */
function getCollaborationState(collaboration: UseCollaborationReturn | undefined): {
  useCollaborationMode: boolean;
  isInitialSyncPending: boolean;
  collaborationConfig: CollaborationConfig | undefined;
} {
  const ready = Boolean(
    collaboration?.ydoc && collaboration?.xmlFragment && collaboration?.collaborationUser,
  );
  if (!ready || !collaboration) {
    return {
      useCollaborationMode: false,
      isInitialSyncPending: false,
      collaborationConfig: undefined,
    };
  }
  const config: CollaborationConfig = {
    ydoc: collaboration.ydoc,
    xmlFragment: collaboration.xmlFragment,
    awareness: collaboration.awareness,
    user: collaboration.collaborationUser,
    updateCursor: collaboration.updateCursor,
    updateSelection: collaboration.updateSelection,
    isSynced: collaboration.isSynced,
  };
  return {
    useCollaborationMode: true,
    isInitialSyncPending: !collaboration.isSynced,
    collaborationConfig: config,
  };
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
  /**
   * カーソル位置にコンテンツを挿入するコールバック ref。TiptapEditor に透過的に渡す。
   * Ref to insert content at the editor's cursor. Forwarded to TiptapEditor.
   */
  insertAtCursorRef?: MutableRefObject<((content: unknown) => boolean) | null>;
  /**
   * 編集中ページの noteId。WikiLink 候補・解決のスコープを決定する。
   * `null` は個人ページ、文字列値はそのノートに所属するノートネイティブ
   * ページ。Issue #713 Phase 4 を参照。
   *
   * Owning note ID of the page being edited. Determines WikiLink scope:
   * `null` limits candidates to personal pages, a string limits them to the
   * same note. See issue #713 Phase 4.
   */
  pageNoteId?: string | null;
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
  insertAtCursorRef,
  pageNoteId = null,
}) => {
  const isEditorReadOnly = isReadOnly ?? isWikiGenerating;
  const hasContent = useMemo(() => isContentNotEmpty(content), [content]);

  const contentFocusRef = useRef<(() => void) | null>(null);
  const focusContent = useCallback(() => {
    contentFocusRef.current?.();
  }, []);

  const { useCollaborationMode, isInitialSyncPending, collaborationConfig } =
    getCollaborationState(collaboration);
  // Issue #880: `isSynced` を満たすまで本文 editor を表示しない。`ydoc/xmlFragment`
  // は HocuspocusProvider の初期同期完了より前に作られるため、ここを編集可能条件に
  // すると空 Y.Doc に入力できてしまい、その直後に届く remote update と競合する。
  // タイトル input は `pages.title` 列に独立して保存され Y.Doc とは無関係なため、
  // 初期同期中も編集可能にしておく（保存レースは発生しない）。
  //
  // Issue #880: keep the body editor unmounted until the initial Y.Doc sync
  // completes. Using `ydoc/xmlFragment` presence alone would let users type
  // into an empty Y.Doc that is about to be overwritten by the remote sync.
  // Title input persists into `pages.title` (separate from Y.Doc) so there is
  // no race and it can remain editable during sync.
  const showCollaborationLoading = Boolean(
    collaboration && (!useCollaborationMode || isInitialSyncPending),
  );
  const showEditor = (useCollaborationMode && !isInitialSyncPending) || !collaboration;

  return (
    <div className="flex-1 pt-6 pb-32">
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
                insertAtCursorRef={insertAtCursorRef}
                initialContent={initialContent}
                onInitialContentApplied={onInitialContentApplied}
                wikiContentForCollab={wikiContentForCollab ?? undefined}
                onWikiContentApplied={onWikiContentApplied}
                pageNoteId={pageNoteId}
              />
            </>
          )}
        </div>

        {/* Linked Pages Section */}
        {showLinkedPages && currentPageId && (
          <LinkedPagesSection pageId={currentPageId} isSyncingLinks={isSyncingLinks} />
        )}

        {/* Lint Suggestions */}
        {currentPageId && <LintSuggestions pageId={currentPageId} />}
      </Container>
    </div>
  );
};
