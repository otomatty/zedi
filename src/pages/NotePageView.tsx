import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download, History, Trash2 } from "lucide-react";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { PageEditorContent } from "@/components/editor/PageEditor/PageEditorContent";
import {
  PageEditorHeader,
  type PageDetailToolbarAction,
} from "@/components/editor/PageEditor/PageEditorHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  useToast,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import {
  useNote,
  useNotePage,
  noteKeys,
  useNoteApi,
  useRemovePageFromNote,
} from "@/hooks/useNoteQueries";
import { useUpdatePage } from "@/hooks/usePageQueries";
import { useAuth } from "@/hooks/useAuth";
import { useCollaboration } from "@/hooks/useCollaboration";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { NoteWorkspaceProvider, useNoteWorkspaceOptional } from "@/contexts/NoteWorkspaceContext";
import { useAIChatContext } from "@/contexts/AIChatContext";
import { NoteWorkspaceToolbar } from "@/components/note/NoteWorkspaceToolbar";
import { useMarkdownExport } from "@/components/editor/PageEditor/useMarkdownExport";
import { PageHistoryModal } from "@/components/editor/pageHistory/PageHistoryModal";
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
 * `/pages/:id` 側 (`PageEditorLayout`) と揃えた共通メニュー項目のうち、
 * 「変更履歴」「Markdown でエクスポート」「Markdown をコピー」までを構築する。
 * 削除は別 i18n キーと destructive スタイル、`separatorBefore` を伴うため
 * 呼び出し側で `delete` 項目を末尾に追加する想定。
 *
 * Build the shared menu items (history / export markdown / copy markdown)
 * that match the `/pages/:id` toolbar (`PageEditorLayout`). Callers append a
 * destructive `delete` entry with `separatorBefore` separately, since the
 * read-only path does not surface deletion.
 */
function buildSharedMenuItems({
  t,
  onOpenHistory,
  onExportMarkdown,
  onCopyMarkdown,
}: {
  t: (key: string) => string;
  onOpenHistory: () => void;
  onExportMarkdown: () => void;
  onCopyMarkdown: () => void;
}): PageDetailToolbarAction[] {
  return [
    {
      id: "history",
      label: t("editor.pageHistory.menuButton"),
      icon: History,
      onClick: onOpenHistory,
    },
    {
      id: "export-markdown",
      label: t("editor.pageMenu.exportMarkdown"),
      icon: Download,
      onClick: onExportMarkdown,
    },
    {
      id: "copy-markdown",
      label: t("editor.pageMenu.copyMarkdown"),
      icon: Copy,
      onClick: onCopyMarkdown,
    },
  ];
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
  onBack,
  onRequestDelete,
  isDeletePending,
  supplementalRightContent,
  cancelPendingTitleSaveRef,
}: {
  page: Page;
  noteId: string;
  collaboration: UseCollaborationReturn;
  isCollaborationEnabled: boolean;
  /** ページ所有者のみタイトル編集可。Only the page owner can edit the title. */
  isTitleEditable: boolean;
  /** ヘッダーの戻るボタン。Toolbar back button. */
  onBack: () => void;
  /**
   * 削除メニュー押下時に呼ぶ。確認ダイアログとミューテーションは親 (`NotePageView`)
   * が所有しており、ナビゲーション・toast との整合性を一箇所で扱う。
   *
   * Invoked when the delete menu item is selected. The confirmation dialog
   * and the mutation live on the parent (`NotePageView`) so navigation +
   * toast handling stay in one place.
   */
  onRequestDelete: () => void;
  /** 削除実行中はメニューを抑止する。Disable delete while the mutation is pending. */
  isDeletePending: boolean;
  /** ツールバー右側の追加スロット。Supplemental right-side toolbar slot. */
  supplementalRightContent?: React.ReactNode;
  /**
   * 親が削除成功時に呼ぶ「保留中タイトル保存のキャンセル」を流す ref。
   * 削除直後の navigate で `NotePageEditorEditable` がアンマウントされる際、
   * 既存の cleanup が pending title を flush して既に消したページに対して
   * `putPageContent` を発火する競合 (Codex P2) を抑止する。
   *
   * Mutable ref the parent calls in the delete-success path to cancel any
   * debounced title save before navigation. Without this, the unmount
   * cleanup in this component flushes the pending title against the
   * just-deleted page and surfaces a spurious title-save-failed toast
   * (Codex P2 review on PR #891).
   */
  cancelPendingTitleSaveRef?: React.MutableRefObject<(() => void) | null>;
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const { handleExportMarkdown, handleCopyMarkdown } = useMarkdownExport(
    title,
    editorContent,
    page.sourceUrl,
  );

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
  // 削除フローが進行中の save をキャンセルしたいと宣言したら立てるフラグ。
  // debounce 済みで既に in-flight な `persistTitleRef.current()` は単純な
  // timer cancel では止められないため、await 後に毎回このフラグを見て
  // 早期 return する。Cache invalidation / setTitle ロールバック / toast /
  // throw のすべてを抑止する。CodeRabbit major (PR #891)。
  //
  // Set by the cancel hook when the delete path wants in-flight saves to be
  // dropped. Clearing the debounce timer alone cannot stop a save that
  // already entered `persistTitleRef.current()` and is awaiting the
  // network, so this flag is re-checked after each await — when set, the
  // save returns without invalidating caches, rolling back the title,
  // toasting, or re-throwing. CodeRabbit major review on PR #891.
  const suppressTitleSaveEffectsRef = useRef(false);

  const persistTitleRef = useRef<(nextTitle: string) => Promise<void>>(async () => {});
  persistTitleRef.current = async (nextTitle: string) => {
    const previousTitle = lastSavedTitleRef.current;
    try {
      if (page.noteId !== null) {
        const current = await api.getPageContent(page.id);
        if (suppressTitleSaveEffectsRef.current) return;
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
      // 削除完了後はキャッシュ無効化も lastSaved 更新もスキップする。
      // After cancel (delete path), skip cache invalidation and lastSaved update —
      // `useRemovePageFromNote` has already invalidated note caches.
      if (suppressTitleSaveEffectsRef.current) return;
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
      // 削除済みページに対する失敗は予期されたもの。toast / rollback を抑止する。
      // Expected failure path when the page was just deleted out from under us;
      // suppress toast + rollback + rethrow so we don't surface
      // `errors.titleSaveFailedTitle` right after a successful delete.
      if (suppressTitleSaveEffectsRef.current) return;
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

  // 削除フローから「保留中タイトル保存をキャンセルしてアンマウント flush を
  // 抑止する」関数を呼べるよう、親から渡された ref に書き込む。
  // 1) debounce timer をクリア → 未着火の save を抑止
  // 2) `pendingTitleRef` を null 化 → アンマウント flush は pending null で即 return
  // 3) `suppressTitleSaveEffectsRef` を立てる → 既に in-flight な save が
  //    完了/失敗してもキャッシュ更新・toast・throw を全部スキップする
  //
  // Expose a cancel function to the parent via ref so the delete-success path
  // can drop the pending title save before unmount. Three guards combined:
  // 1) clear the debounce timer (kills not-yet-fired saves);
  // 2) null `pendingTitleRef.current` (makes the unmount flush a no-op);
  // 3) raise `suppressTitleSaveEffectsRef` so any save that's already mid-await
  //    no longer triggers cache invalidation / toast / rollback / rethrow.
  // Codex P2 + CodeRabbit major reviews on PR #891.
  useEffect(() => {
    if (!cancelPendingTitleSaveRef) return;
    cancelPendingTitleSaveRef.current = () => {
      suppressTitleSaveEffectsRef.current = true;
      if (titleSaveTimerRef.current) {
        clearTimeout(titleSaveTimerRef.current);
        titleSaveTimerRef.current = null;
      }
      pendingTitleRef.current = null;
    };
    return () => {
      cancelPendingTitleSaveRef.current = null;
    };
  }, [cancelPendingTitleSaveRef]);

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);

  const handleRestored = useCallback(() => {
    // 復元後にページをリロードして最新状態を反映する。`/pages/:id` 側の
    // `PageEditorLayout.handleRestored` と同じ方針。
    // Reload after restore to mirror the `/pages/:id` flow.
    window.location.reload();
  }, []);

  // `/pages/:id` と同じ4項目（履歴 → エクスポート → コピー → 区切り → 削除）を
  // 構築する。Markdown 操作のソースは編集中の `title` / `editorContent` を使う
  // ので、編集中の変更も即時反映される。削除は親 (`NotePageView`) が確認ダイアログ
  // とミューテーションを所有しており、ここではトリガーだけを呼び出す。
  //
  // Build the same four menu items as `/pages/:id` (history → export → copy →
  // separator → delete). Markdown actions read live `title` / `editorContent`,
  // so in-flight edits are surfaced. Deletion is owned by the parent
  // (`NotePageView`) — this just fires the request to open the confirmation.
  const menuItems = useMemo<PageDetailToolbarAction[]>(
    () => [
      ...buildSharedMenuItems({
        t,
        onOpenHistory: handleOpenHistory,
        onExportMarkdown: handleExportMarkdown,
        onCopyMarkdown: handleCopyMarkdown,
      }),
      {
        id: "delete",
        label: t("editor.pageMenu.deletePage"),
        icon: Trash2,
        onClick: onRequestDelete,
        destructive: true,
        separatorBefore: true,
        disabled: isDeletePending,
      },
    ],
    [
      t,
      handleOpenHistory,
      handleExportMarkdown,
      handleCopyMarkdown,
      onRequestDelete,
      isDeletePending,
    ],
  );

  // React Compiler が optional chain の依存を保持できないため先に抽出する。
  // Extract ydoc to avoid React Compiler memoization issue with optional chaining.
  const ydoc = isCollaborationEnabled ? (collaboration.ydoc ?? null) : null;

  return (
    <>
      <ContentWithAIChat>
        <PageEditorHeader
          onBack={onBack}
          menuItems={menuItems}
          supplementalRightContent={supplementalRightContent}
        />
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
      {historyOpen && (
        <PageHistoryModal
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          pageId={page.id}
          currentYdoc={ydoc}
          onRestored={handleRestored}
        />
      )}
    </>
  );
}

/**
 * 閲覧専用モードのノートページ本文。共通ツールバーには「変更履歴」「Markdown
 * でエクスポート」「Markdown をコピー」を出すが、削除は出さない。Markdown の
 * ソースは `page.title` / `page.content` をそのまま使う。
 *
 * Read-only note page body. Surfaces the shared toolbar with history /
 * export / copy actions but omits delete. Markdown export and copy read the
 * saved `page.title` / `page.content` directly.
 */
function NotePageReadOnly({
  page,
  onBack,
  supplementalRightContent,
  canViewHistory,
}: {
  page: Page;
  onBack: () => void;
  supplementalRightContent?: React.ReactNode;
  /**
   * 履歴メニューを出してよいかどうか。サーバの `/api/pages/:id/snapshots` は
   * `authRequired` のため、未ログインの guest が公開・unlisted ノートを
   * 閲覧している場合に履歴を出すと 401 で必ず失敗する (Codex P2)。呼び出し側で
   * `isSignedIn` を渡し、未認証時は履歴項目自体を出さない。
   *
   * Whether the history menu item should be exposed. The server's
   * `/api/pages/:id/snapshots` route is `authRequired`, so showing the
   * history entry to unauthenticated guests viewing a public / unlisted
   * note page would guarantee a 401 inside `PageHistoryModal`. The parent
   * passes `isSignedIn` so we hide the entry instead of exposing a broken
   * flow (Codex P2 review on PR #891).
   */
  canViewHistory: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { handleExportMarkdown, handleCopyMarkdown } = useMarkdownExport(
    page.title,
    page.content ?? "",
    page.sourceUrl,
  );

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);

  const handleRestored = useCallback(() => {
    window.location.reload();
  }, []);

  const menuItems = useMemo<PageDetailToolbarAction[]>(() => {
    const items: PageDetailToolbarAction[] = [];
    if (canViewHistory) {
      items.push({
        id: "history",
        label: t("editor.pageHistory.menuButton"),
        icon: History,
        onClick: handleOpenHistory,
      });
    }
    items.push(
      {
        id: "export-markdown",
        label: t("editor.pageMenu.exportMarkdown"),
        icon: Download,
        onClick: handleExportMarkdown,
      },
      {
        id: "copy-markdown",
        label: t("editor.pageMenu.copyMarkdown"),
        icon: Copy,
        onClick: handleCopyMarkdown,
      },
    );
    return items;
  }, [t, canViewHistory, handleOpenHistory, handleExportMarkdown, handleCopyMarkdown]);

  return (
    <>
      <PageEditorHeader
        onBack={onBack}
        menuItems={menuItems}
        supplementalRightContent={supplementalRightContent}
      />
      <PageEditorContent
        content={page.content ?? ""}
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
      {historyOpen && (
        <PageHistoryModal
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          pageId={page.id}
          currentYdoc={null}
          onRestored={handleRestored}
        />
      )}
    </>
  );
}

/**
 * ノートからページを削除する確認ダイアログ。`/pages/:id` の削除フローと同じ
 * UX (`AlertDialog` + destructive Action) を踏襲しつつ、ミューテーション中は
 * 閉じる操作を抑止する。
 *
 * Confirmation dialog for removing a page from a note. Mirrors the
 * `/pages/:id` delete UX (`AlertDialog` + destructive action) and suppresses
 * close interactions while the mutation is pending.
 */
function NotePageDeleteConfirmDialog({
  open,
  onOpenChange,
  isPending,
  pageTitle,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  pageTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <AlertDialog
      open={open}
      // ミューテーション実行中は閉じる操作（Action / Cancel / Esc / overlay）を
      // 無視し、`onSuccess` / `onError` で明示的に閉じる動線に揃える。
      //
      // Suppress overlay/Esc dismissal while the mutation is in flight so the
      // dialog only closes through the explicit success / error paths.
      onOpenChange={(nextOpen) => {
        if (isPending && !nextOpen) return;
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.page.deleteConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("common.page.deleteBody", { title: pageTitle })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isPending}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Radix の自動 close を抑止し、ミューテーション完了まで pending UI を保つ。
              // Suppress Radix auto-close so the pending UI stays until the mutation settles.
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
          >
            {isPending ? t("common.page.deleting") : t("common.page.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const removeFromNoteMutation = useRemovePageFromNote();

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

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // 削除成功時に編集中の保留タイトル保存を flush せずに捨てるためのフック。
  // `NotePageEditorEditable` がマウント中、自分自身のキャンセル関数をここに
  // 書き込む（mount 時に set、unmount 時に null）。削除直後の navigate で
  // child が unmount される前に呼び出すことで、もう存在しないページに
  // タイトル保存リクエストが飛ぶのを防ぐ (Codex P2 review on PR #891)。
  //
  // Mutable handle used to cancel any debounced title save before the
  // delete-success navigation. The editable child writes its own cancel
  // function into this ref while mounted (cleared on unmount); the parent
  // invokes it inside `onSuccess` so the about-to-unmount cleanup no longer
  // fires a `putPageContent` against the page we just removed. Codex P2
  // review on PR #891.
  const cancelPendingTitleSaveRef = useRef<(() => void) | null>(null);

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

  const handleRequestDelete = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const handleCancelDelete = useCallback(() => {
    if (removeFromNoteMutation.isPending) return;
    setDeleteConfirmOpen(false);
  }, [removeFromNoteMutation.isPending]);

  const handleConfirmDelete = useCallback(() => {
    if (!noteId || !page?.id) return;
    // `removeFromNoteMutation.isPending` は次の React コミットまで true に
    // ならないため、`AlertDialogAction` の `disabled` だけでは同一フレームの
    // 二重クリックを防げない（CodeRabbit major）。同期的に `isPending` を
    // 見て早期 return することで、`mutate` の二重発火と二重 toast / 二重
    // navigate を確実に抑止する。
    //
    // `removeFromNoteMutation.isPending` only flips on the next render commit,
    // so the `disabled` prop on `AlertDialogAction` cannot stop same-frame
    // double-clicks. Bail synchronously on `isPending` to keep `mutate` from
    // firing twice (which would surface duplicate toasts + navigations).
    // CodeRabbit major review on PR #891.
    if (removeFromNoteMutation.isPending) return;
    const displayTitle = page.title || t("common.untitledPage");
    removeFromNoteMutation.mutate(
      { noteId, pageId: page.id },
      {
        onSuccess: () => {
          toast({
            title: t("common.page.pageDeleted"),
            description: t("common.page.deletedWithTitle", { title: displayTitle }),
          });
          // `useRemovePageFromNote` 側で note 系キャッシュは無効化済み。
          // `useRemovePageFromNote` already invalidates the note detail and
          // window caches; nothing extra to do here.
          setDeleteConfirmOpen(false);
          // navigate でアンマウントされる前に、編集中の保留タイトル保存を破棄する。
          // 既存の cleanup が pending を flush すると、消したばかりのページに
          // `putPageContent` が飛んで保存失敗トーストが出てしまう (Codex P2)。
          //
          // Cancel any debounced title save before navigation so the editable
          // child's unmount cleanup does not flush against the just-removed
          // page. Codex P2 review on PR #891.
          cancelPendingTitleSaveRef.current?.();
          navigate(`/notes/${noteId}`);
        },
        onError: (error) => {
          console.error("Failed to remove page from note:", error);
          toast({
            title: t("common.error"),
            description: t("common.page.deleteFailed"),
            variant: "destructive",
          });
          setDeleteConfirmOpen(false);
        },
      },
    );
  }, [noteId, page, removeFromNoteMutation, toast, t, navigate]);

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

  const supplementalRightContent = !canEdit ? (
    <span className="text-muted-foreground text-xs">{t("common.readOnly", "閲覧専用")}</span>
  ) : undefined;

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

  const displayTitle = page.title || t("common.untitledPage");
  const isDeletePending = removeFromNoteMutation.isPending;

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
              onBack={handleBack}
              onRequestDelete={handleRequestDelete}
              isDeletePending={isDeletePending}
              supplementalRightContent={supplementalRightContent}
              cancelPendingTitleSaveRef={cancelPendingTitleSaveRef}
            />
          ) : (
            <NotePageReadOnly
              page={page}
              onBack={handleBack}
              supplementalRightContent={supplementalRightContent}
              canViewHistory={isSignedIn}
            />
          )}
        </NoteWorkspaceProvider>
      </div>
      <NotePageDeleteConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        isPending={isDeletePending}
        pageTitle={displayTitle}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default NotePageView;
