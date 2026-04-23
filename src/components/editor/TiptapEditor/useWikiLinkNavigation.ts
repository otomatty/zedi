import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePageByTitle, usePagesSummary, useCreatePage } from "@/hooks/usePageQueries";
import { useNotePages } from "@/hooks/useNoteQueries";

interface UseWikiLinkNavigationOptions {
  /**
   * 編集中ページの noteId。`null` は個人ページ、文字列値はノートネイティブ
   * ページ。リンク先の検索スコープと遷移先 URL を切り替えるために使用する。
   * Issue #713 Phase 4。
   *
   * Owning note ID of the page being edited. `null` scopes resolution to
   * personal pages and navigates to `/pages/:id`; a string scopes resolution
   * to same-note pages and navigates to `/notes/:noteId/:pageId`. See
   * issue #713 Phase 4.
   */
  pageNoteId: string | null;
}

interface UseWikiLinkNavigationReturn {
  handleLinkClick: (title: string) => void;
  createPageDialogOpen: boolean;
  pendingCreatePageTitle: string | null;
  handleConfirmCreate: () => Promise<void>;
  handleCancelCreate: () => void;
}

/**
 * Hook to handle WikiLink navigation
 * When a WikiLink is clicked, it checks if the page exists and either navigates to it
 * or shows a dialog to create a new page.
 *
 * WikiLink クリック時、`pageNoteId` に応じて候補スコープを切り替える。
 * - `pageNoteId === null` → 個人ページのみを検索し、`/pages/:id` に遷移。
 * - `pageNoteId !== null` → そのノート内のページのみを検索し、
 *   canonical ルート `/notes/:pageNoteId/:id` に遷移。
 *
 * Issue #713 Phase 4。
 */
export function useWikiLinkNavigation(
  options: UseWikiLinkNavigationOptions = { pageNoteId: null },
): UseWikiLinkNavigationReturn {
  const { pageNoteId } = options;
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const [linkTitleToFind, setLinkTitleToFind] = useState<string | null>(null);

  // 個人スコープ: 個人ページに対する大小文字を無視したタイトル検索。
  // `usePageByTitle` は完全一致 (`trim` のみ) しか返さないため、既存キャッシュ
  // ヒット時はそれを使い、そうでなければ `usePagesSummary` の結果を大小文字
  // 無視で走査する。`syncLinksWithRepo` と `WikiLinkSuggestion` が `toLowerCase`
  // で解決しているので、ナビゲーションもスコープ間で揃える。Issue #713 Phase 4。
  //
  // Personal scope: case-insensitive title lookup over personal pages.
  // `usePageByTitle` is case-sensitive, so we prefer its cache when it hits
  // and otherwise fall back to a case-insensitive scan of `usePagesSummary`
  // to mirror the normalization already used by `syncLinksWithRepo` and the
  // suggestion UI. See issue #713 Phase 4.
  const shouldQueryPersonal = pageNoteId === null && !!linkTitleToFind;
  const personalLookup = usePageByTitle(shouldQueryPersonal ? linkTitleToFind || "" : "");
  const personalSummary = usePagesSummary({ enabled: shouldQueryPersonal });

  const personalResolved = useMemo(() => {
    if (!shouldQueryPersonal || !linkTitleToFind) {
      return { data: null as { id: string; title: string } | null, isFetched: true };
    }
    if (personalLookup.data) {
      return {
        data: { id: personalLookup.data.id, title: personalLookup.data.title },
        isFetched: personalLookup.isFetched,
      };
    }
    const normalized = linkTitleToFind.trim().toLowerCase();
    const list = personalSummary.data ?? [];
    const found = list.find(
      (p) => !p.isDeleted && (p.title ?? "").trim().toLowerCase() === normalized,
    );
    return {
      data: found ? { id: found.id, title: found.title } : null,
      isFetched: personalLookup.isFetched && !personalSummary.isLoading,
    };
  }, [
    shouldQueryPersonal,
    linkTitleToFind,
    personalLookup.data,
    personalLookup.isFetched,
    personalSummary.data,
    personalSummary.isLoading,
  ]);

  // ノートスコープ: そのノートに所属するページ一覧に対する大小文字無視の検索。
  // Note scope: case-insensitive title lookup against the note's page list.
  const shouldQueryNote = pageNoteId !== null && !!linkTitleToFind;
  const notePagesQuery = useNotePages(pageNoteId ?? "", undefined, Boolean(pageNoteId));

  const noteLookup = useMemo(() => {
    if (!shouldQueryNote || !linkTitleToFind) {
      return { data: null as { id: string; title: string } | null, isFetched: true };
    }
    const normalized = linkTitleToFind.trim().toLowerCase();
    const list = notePagesQuery.data ?? [];
    // 削除済みページは候補から外す（個人スコープのフォールバックが
    // `!p.isDeleted` を見ているので挙動を揃える。Issue #713 Phase 4）。
    // Exclude deleted pages to match the personal fallback and avoid
    // navigating to a tombstone instead of showing the create dialog.
    const found = list.find(
      (p) => !p.isDeleted && (p.title ?? "").trim().toLowerCase() === normalized,
    );
    return {
      data: found ? { id: found.id, title: found.title } : null,
      isFetched: notePagesQuery.isFetched,
    };
  }, [shouldQueryNote, linkTitleToFind, notePagesQuery.data, notePagesQuery.isFetched]);

  const foundPage = pageNoteId === null ? personalResolved.data : noteLookup.data;
  const isFetched = pageNoteId === null ? personalResolved.isFetched : noteLookup.isFetched;

  // Pending link action
  const pendingLinkActionRef = useRef<{ title: string } | null>(null);

  // Create page confirmation dialog state
  const [createPageDialogOpen, setCreatePageDialogOpen] = useState(false);
  const [pendingCreatePageTitle, setPendingCreatePageTitle] = useState<string | null>(null);

  // Handle link click - navigate to page or create new
  // WikiLinkクリック時は常に既存ページの存在をチェック（byTitle キャッシュに依存、createdPageIdsRef は廃止）
  const handleLinkClick = useCallback((title: string) => {
    pendingLinkActionRef.current = { title };
    setLinkTitleToFind(title);
  }, []);

  // Navigate when found page changes
  useEffect(() => {
    const handleNavigation = async () => {
      // linkTitleToFindが設定されていない場合は何もしない
      if (!linkTitleToFind || !pendingLinkActionRef.current) return;

      const { title } = pendingLinkActionRef.current;

      // タイトルが一致しない場合は何もしない
      if (linkTitleToFind !== title) return;

      // クエリがまだ完了していない場合は待機
      if (!isFetched) return;

      // ユーザーがクリックしていない場合は何もしない（初期レンダリング対策）
      if (!title.trim()) return;

      if (foundPage) {
        // 既存ページが見つかった場合はそのページに移動。ノートスコープ時は
        // 短縮形の `/notes/:noteId/:pageId`（App.tsx の canonical ルート）に
        // 直接遷移して、旧パス `/notes/:noteId/pages/:pageId` のリダイレクトを
        // 踏まないようにする。個人スコープ時は従来どおり `/pages/:id`。
        //
        // Existing page: route to `/notes/:noteId/:pageId` (the canonical
        // note page route defined in `App.tsx`) to avoid the legacy
        // `/notes/:noteId/pages/:pageId` redirect hop. Personal scope uses
        // `/pages/:id` as before.
        const target = pageNoteId
          ? `/notes/${pageNoteId}/${foundPage.id}`
          : `/pages/${foundPage.id}`;
        navigate(target, { replace: false, flushSync: true });
      } else {
        // ページが見つからなかった場合は確認ダイアログを表示
        setPendingCreatePageTitle(title);
        setCreatePageDialogOpen(true);
      }

      // 状態をクリア
      pendingLinkActionRef.current = null;
      setLinkTitleToFind(null);
    };

    handleNavigation();
  }, [foundPage, isFetched, linkTitleToFind, navigate, pageNoteId]);

  // Handle create page confirmation
  // 新規ページ作成パスは個人スコープでのみ有効。ノートネイティブページの
  // 作成はノート配下の別フロー（`POST /api/notes/:noteId/pages`）で行うため、
  // ここでは個人ページとして作成し `/pages/:id` へ遷移する。Issue #713 Phase 4。
  //
  // Page creation from a WikiLink is only supported in personal scope; note
  // scope is handled by a separate flow (`POST /api/notes/:noteId/pages`).
  const handleConfirmCreate = useCallback(async () => {
    if (!pendingCreatePageTitle) return;
    if (pageNoteId) {
      // ノートスコープ内での新規作成は未対応。今は何もせずダイアログを閉じる。
      setCreatePageDialogOpen(false);
      setPendingCreatePageTitle(null);
      return;
    }

    try {
      const newPage = await createPageMutation.mutateAsync({
        title: pendingCreatePageTitle,
        content: "",
      });
      setCreatePageDialogOpen(false);
      setPendingCreatePageTitle(null);
      navigate(`/pages/${newPage.id}`, { replace: false, flushSync: true });
    } catch (error) {
      console.error("Failed to create page:", error);
    }
  }, [pendingCreatePageTitle, createPageMutation, navigate, pageNoteId]);

  const handleCancelCreate = useCallback(() => {
    setCreatePageDialogOpen(false);
    setPendingCreatePageTitle(null);
  }, []);

  return {
    handleLinkClick,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  };
}
