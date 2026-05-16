import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { PageEditorContent } from "@/components/editor/PageEditor/PageEditorContent";
import {
  PageEditorHeader,
  type PageDetailToolbarAction,
} from "@/components/editor/PageEditor/PageEditorHeader";
import { Button, useToast } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import {
  useNote,
  useNotePage,
  noteKeys,
  useCopyNotePageToPersonal,
  useNoteApi,
} from "@/hooks/useNoteQueries";
import { useUpdatePage } from "@/hooks/usePageQueries";
import { useAuth } from "@/hooks/useAuth";
import { useCollaboration } from "@/hooks/useCollaboration";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { NoteWorkspaceProvider, useNoteWorkspaceOptional } from "@/contexts/NoteWorkspaceContext";
import { useAIChatContext } from "@/contexts/AIChatContext";
import { NoteWorkspaceToolbar } from "@/components/note/NoteWorkspaceToolbar";
import { convertMarkdownToTiptapContent } from "@/lib/markdownToTiptap";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";
import type { Page } from "@/types/page";

const TITLE_SAVE_DEBOUNCE_MS = 500;

function canEditPage(
  access: { canEdit?: boolean; canView?: boolean } | undefined,
  userId: string | undefined,
  page: { ownerUserId?: string; noteId?: string | null } | null | undefined,
): boolean {
  if (!access?.canView || !page) return false;
  if (page.noteId !== null && page.noteId !== undefined) {
    return Boolean(access.canEdit);
  }
  if (access.canEdit) return true;
  return Boolean(userId && page?.ownerUserId && page.ownerUserId === userId);
}

/**
 * リンク済み個人ページ (`noteId === null`) のタイトル更新はページ所有者だけに許す。
 * ノートネイティブページ (`noteId !== null`) はノート権限 (`canEdit`) 側で別判定する。
 * For linked personal pages (`noteId === null`), only the page owner may edit
 * the title. Note-native pages (`noteId !== null`) are gated separately by
 * note-level edit permission.
 */
function canEditTitle(
  userId: string | undefined,
  page: { ownerUserId?: string } | null | undefined,
): boolean {
  return Boolean(userId && page?.ownerUserId && page.ownerUserId === userId);
}

/**
 * Uses `key` on the parent so page switches reset local editor state.
 * `editorContent` の初期値は `page.content` から。
 */
function NotePageEditorEditable({
  page,
  noteId,
  collaboration,
  isCollaborationEnabled,
  isTitleEditable,
  toolbar,
}: {
  page: Page;
  noteId: string;
  collaboration: UseCollaborationReturn;
  isCollaborationEnabled: boolean;
  /** ページ所有者のみタイトル編集可。Only the page owner can edit the title. */
  isTitleEditable: boolean;
  /**
   * Sticky toolbar rendered as the first child of the scroll container
   * (`ContentWithAIChat`), above `NoteWorkspaceToolbar`. Passed in from the
   * parent so the shared `PageEditorHeader` can hook into the same scroll
   * area and toggle visibility on scroll.
   *
   * 共通ツールバー。`ContentWithAIChat` の生成するスクロールコンテナ直下に
   * 配置することで、`PageEditorHeader` の sticky / scroll-hide 挙動を維持する。
   */
  toolbar?: React.ReactNode;
}): React.JSX.Element {
  const [editorContent, setEditorContent] = useState(page.content ?? "");
  const [title, setTitle] = useState(page.title);
  const { api } = useNoteApi();
  const { setPageContext, contentAppendHandlerRef, insertAtCursorRef } = useAIChatContext();
  const noteWorkspace = useNoteWorkspaceOptional();
  const workspaceRoot = noteWorkspace?.workspaceRoot ?? null;
  const editorInsertRef = useRef<((content: unknown) => boolean) | null>(null);
  const updatePageMutation = useUpdatePage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const isSavingTitleRef = useRef(false);
  const lastSavedTitleRef = useRef(page.title);

  useEffect(() => {
    setPageContext({
      type: "editor",
      pageId: page.id,
      noteId: page.noteId ?? undefined,
      claudeWorkspaceRoot: workspaceRoot ?? undefined,
      pageTitle: title,
      pageContent: editorContent.slice(0, 3000),
      pageFullContent: editorContent,
    });
  }, [page.id, page.noteId, title, editorContent, setPageContext, workspaceRoot]);

  useEffect(() => {
    return () => setPageContext(null);
  }, [setPageContext]);

  useEffect(() => {
    contentAppendHandlerRef.current = setEditorContent;
    return () => {
      contentAppendHandlerRef.current = null;
    };
  }, [contentAppendHandlerRef]);

  useEffect(() => {
    insertAtCursorRef.current = (markdown: string) => {
      if (!editorInsertRef.current) return false;
      try {
        // この経路は AI チャットアシスタントの Markdown を挿入する用途。
        // 先頭の `# Title` 行はページタイトル input と重複するため落とす（issue #784）。
        // This path inserts AI chat assistant Markdown. Drop a leading `# Title` line so it
        // does not duplicate the page-title input as a literal paragraph (issue #784).
        const docJson = convertMarkdownToTiptapContent(markdown, { dropLeadingH1: true });
        const doc = JSON.parse(docJson) as { content: unknown[] };
        return editorInsertRef.current(doc.content);
      } catch {
        return false;
      }
    };
    return () => {
      insertAtCursorRef.current = null;
    };
  }, [insertAtCursorRef]);

  // 最新の persistTitle をミュータブルな ref に退避する。useMutation の戻り値は
  // 状態遷移（idle → pending → success）ごとに identity が変わるため、直接
  // useCallback の依存に入れるとアンマウント用 effect の cleanup が過剰発火し、
  // 保留中の保存が debounce を待たずに走ってしまう。ref 経由なら effect 側は
  // 安定した参照だけを見て済む。
  // Keep the latest persistTitle in a mutable ref. `useMutation()` returns a new
  // object on every state transition (idle → pending → success), so referencing
  // the mutation directly in a `useCallback` dep array would cause the unmount
  // flush effect's cleanup to fire mid-typing and flush the debounce early.
  const persistTitleRef = useRef<(nextTitle: string) => Promise<void>>(async () => {});
  persistTitleRef.current = async (nextTitle: string) => {
    const previousTitle = lastSavedTitleRef.current;
    try {
      if (page.noteId !== null) {
        const current = await api.getPageContent(page.id);
        await api.putPageContent(page.id, {
          ydoc_state: current.ydoc_state,
          content_text: current.content_text ?? undefined,
          expected_version: current.version,
          title: nextTitle,
        });
      } else {
        await updatePageMutation.mutateAsync({
          pageId: page.id,
          updates: { title: nextTitle },
        });
      }
      lastSavedTitleRef.current = nextTitle;
      // `useUpdatePage` updates `pageKeys.*` caches, but the note page list and
      // detail are held under `noteKeys.*`. Invalidate those so the new title
      // propagates to the note view and sidebar.
      // `useUpdatePage` は `pageKeys.*` を更新するが、ノート側のキャッシュは
      // `noteKeys.*` にあるため、タイトル変更をノート表示やサイドバーに反映
      // させるには明示的に無効化する必要がある。
      queryClient.invalidateQueries({ queryKey: noteKeys.page(noteId, page.id) });
      queryClient.invalidateQueries({ queryKey: noteKeys.detailsByNoteId(noteId) });
    } catch (error) {
      if (pendingTitleRef.current === null) {
        setTitle(previousTitle);
      }
      console.error("Failed to save page title:", error);
      toast({
        title: t("errors.titleSaveFailedTitle"),
        description: t("errors.titleSaveFailedDescription"),
        variant: "destructive",
      });
      throw error;
    }
  };

  // タイトル保存を直列化する。保存中なら何もせず、完了後に pending があれば
  // 追随保存する。これにより「古いリクエストが遅延完了して新しい値を上書きする」
  // 先祖返りを防止する。
  // Serialize title saves: skip while a save is in-flight, and re-run once it
  // completes if a newer title is pending. This prevents an out-of-order
  // response from overwriting a more recent edit.
  const flushPendingTitleRef = useRef<() => void>(() => {});
  flushPendingTitleRef.current = () => {
    if (isSavingTitleRef.current) return;
    const pending = pendingTitleRef.current;
    if (pending === null) return;
    pendingTitleRef.current = null;
    isSavingTitleRef.current = true;
    void (async () => {
      try {
        await persistTitleRef.current(pending);
      } catch {
        // persistTitleRef で toast + console.error 済み。ここは coalesce 継続のため握る。
        // Already logged + toasted inside persistTitleRef; swallow so we keep coalescing.
      } finally {
        isSavingTitleRef.current = false;
        if (pendingTitleRef.current !== null) {
          flushPendingTitleRef.current();
        }
      }
    })();
  };

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    pendingTitleRef.current = newTitle;
    if (titleSaveTimerRef.current) {
      clearTimeout(titleSaveTimerRef.current);
    }
    titleSaveTimerRef.current = setTimeout(() => {
      titleSaveTimerRef.current = null;
      flushPendingTitleRef.current();
    }, TITLE_SAVE_DEBOUNCE_MS);
  }, []);

  // アンマウント時に debounce 中のタイトル保存を即時フラッシュし、遷移で失われないようにする。
  // deps は空配列 — ref 経由のみで参照しているため、mutation 状態遷移で cleanup が走らない。
  // Flush any debounced title save on unmount so navigation does not drop it.
  // Empty deps: we only read refs, so cleanup does not fire on mutation state transitions.
  useEffect(() => {
    return () => {
      if (titleSaveTimerRef.current) {
        clearTimeout(titleSaveTimerRef.current);
        titleSaveTimerRef.current = null;
      }
      flushPendingTitleRef.current();
    };
  }, []);

  return (
    <ContentWithAIChat>
      {toolbar}
      <NoteWorkspaceToolbar />
      <PageEditorContent
        content={editorContent}
        title={title}
        sourceUrl={page.sourceUrl}
        currentPageId={page.id}
        pageId={page.id}
        isNewPage={false}
        isWikiGenerating={false}
        isReadOnly={false}
        showLinkedPages={false}
        showToolbar
        onContentChange={setEditorContent}
        onContentError={() => undefined}
        onTitleChange={isTitleEditable ? handleTitleChange : undefined}
        collaboration={isCollaborationEnabled ? collaboration : undefined}
        insertAtCursorRef={editorInsertRef}
        pageNoteId={page.noteId ?? null}
      />
    </ContentWithAIChat>
  );
}

/**
 * Single page inside a note (collaboration, AI chat, optional linked workspace).
 * ノート内の 1 ページ（コラボ・AI チャット・任意のワークスペース連携）。
 */
const NotePageView: React.FC = () => {
  const { noteId, pageId } = useParams<{ noteId: string; pageId: string }>();
  const navigate = useNavigate();
  const { isSignedIn, userId } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const copyToPersonalMutation = useCopyNotePageToPersonal();

  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const { data: page, isLoading: isPageLoading } = useNotePage(
    noteId ?? "",
    pageId ?? "",
    source,
    Boolean(access?.canView),
  );

  const handleBack = useCallback(() => {
    // `/notes/:noteId/:pageId` ルートなので `noteId` は常に存在する。`/home`
    // への fallback は廃止済み（issue #884）。
    // The route guarantees `noteId`, so we always navigate back to the
    // owning note view. The legacy `/home` fallback was removed in #884.
    if (!noteId) return;
    navigate(`/notes/${noteId}`);
  }, [navigate, noteId]);

  const canEdit = canEditPage(access, userId, page);
  const isTitleEditable =
    page?.noteId != null ? Boolean(access?.canEdit) : canEdit && canEditTitle(userId, page);
  const collaborationPageId = page?.id ?? "";
  const isCollaborationEnabled = Boolean(collaborationPageId && isSignedIn && canEdit);
  const collaboration = useCollaboration({
    pageId: collaborationPageId,
    enabled: isCollaborationEnabled,
    mode: "collaborative",
  });

  // ノートネイティブページを自分の個人ページにコピーする (issue #713 Phase 3)。
  // 元のノートページはノートに残り、コピーのみが呼び出し元の個人ページ一覧
  // (`/notes/me`) に現れる。成功時はトーストで新しい個人ページへ誘導する。
  //
  // Copy this note-native page into the caller's personal pages. Source
  // stays in the note; only the copy lands in the caller's default note
  // (`/notes/me`). The toast offers a CTA to jump to it. Plain function on
  // purpose: `useCallback` cannot preserve memoization here (the mutation
  // object identity flips with state transitions) so we let React Compiler
  // handle the surrounding memo.
  const handleCopyToPersonal = async () => {
    if (!noteId || !page?.id) return;
    try {
      const result = await copyToPersonalMutation.mutateAsync({
        noteId,
        sourcePageId: page.id,
      });
      // サーバーへのコピーは成功だが、ローカル IDB への書き戻しが失敗/スキップ
      // された場合は `localImported: false`。その状態で「開く」CTA を押すと
      // `/pages/:id` は IDB を読むので空に着地してしまうため、成功トースト自体
      // は出すが CTA は外して次回 sync まで待つ。
      //
      // If the server-side copy succeeded but the IndexedDB write-through did
      // not (`localImported: false`), navigating `/pages/:id` would land on
      // an empty read because the page grid reads IDB. Keep the success toast
      // but drop the "Open" CTA; the next sync will reconcile the personal
      // page list.
      toast({
        title: t("notes.pageCopiedToPersonal"),
        action: result.localImported ? (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/pages/${result.page_id}`)}>
            {t("common.open")}
          </Button>
        ) : undefined,
      });
    } catch (error) {
      console.error("Failed to copy note page to personal:", error);
      toast({
        title: t("notes.pageCopyToPersonalFailed"),
        variant: "destructive",
      });
    }
  };

  // 共通ツールバーに渡すアクションメニュー。ノートネイティブページ
  // (`page.noteId === noteId`) かつサインイン済みのときだけ「個人に取り込み」
  // を出す。`page.noteId === null` のリンク済み個人ページや未ログイン状態では
  // サーバー側で copy が拒否されるため UI 側でも非表示にする（Codex P2）。
  //
  // Menu items for the shared toolbar. Surface "copy to personal" only for
  // note-native pages (`page.noteId === noteId`) and signed-in viewers; the
  // server rejects copy for linked personal pages (`page.noteId === null`)
  // so we hide the entry instead of showing a guaranteed-fail action.
  const showCopyToPersonal = Boolean(isSignedIn && page && page.noteId === noteId);
  const menuItems: PageDetailToolbarAction[] | undefined = showCopyToPersonal
    ? [
        {
          id: "copy-to-personal",
          label: t("notes.copyToPersonal"),
          icon: Download,
          onClick: () => {
            void handleCopyToPersonal();
          },
          disabled: copyToPersonalMutation.isPending,
        },
      ]
    : undefined;

  const isLoading = isNoteLoading || isPageLoading;
  const isNotFound = !note || !access?.canView || !page;
  if (isLoading) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </PageLoadingOrDenied>
    );
  }
  if (isNotFound) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">
          ページが見つからないか、閲覧権限がありません。
        </p>
      </PageLoadingOrDenied>
    );
  }

  // 共通ツールバー本体。canEdit 分岐で配置場所が変わるため JSX を一度だけ生成する。
  // The shared toolbar is rendered once and placed inside whichever scroll
  // container is active (`ContentWithAIChat` for editors, `bodyClassName`
  // for read-only viewers) so `PageEditorHeader` can find a scrollable
  // ancestor and remain sticky.
  const toolbar = (
    <PageEditorHeader
      onBack={handleBack}
      menuItems={menuItems}
      supplementalRightContent={
        !canEdit ? <span className="text-muted-foreground text-xs">閲覧専用</span> : undefined
      }
    />
  );

  // 編集時は ContentWithAIChat 内のモバイルスクロールラッパー（flex-1 +
  // overflow-y-auto）に高さを伝搬させるため、ラッパーも flex 列にする。
  // ブロックレイアウトのままだと子の `flex-1` が効かず、スクロールラッパーが
  // コンテンツ高さに張り付き overflow-y-auto が発火しない。
  // 閲覧専用時はここで本文をスクロールさせる。
  // When editing, this wrapper is a flex column so the bounded height
  // propagates down to ContentWithAIChat's mobile scroll wrapper (which
  // relies on flex-1). In read-only mode, this wrapper scrolls the body
  // itself.
  const bodyClassName = canEdit
    ? "flex min-h-0 flex-1 flex-col md:overflow-hidden"
    : "min-h-0 flex-1 overflow-y-auto md:overflow-hidden";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={bodyClassName}>
        <NoteWorkspaceProvider key={note.id} noteId={note.id}>
          {canEdit ? (
            <NotePageEditorEditable
              key={page.id}
              noteId={note.id}
              page={page}
              collaboration={collaboration}
              isCollaborationEnabled={isCollaborationEnabled}
              isTitleEditable={isTitleEditable}
              toolbar={toolbar}
            />
          ) : (
            <>
              {toolbar}
              <PageEditorContent
                content={page?.content ?? ""}
                title={page.title}
                sourceUrl={page.sourceUrl}
                currentPageId={page.id}
                pageId={page.id}
                isNewPage={false}
                isWikiGenerating={false}
                isReadOnly={true}
                showLinkedPages={false}
                showToolbar={false}
                onContentChange={() => undefined}
                onContentError={() => undefined}
                pageNoteId={page.noteId ?? null}
              />
            </>
          )}
        </NoteWorkspaceProvider>
      </div>
    </div>
  );
};

export default NotePageView;
