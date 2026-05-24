import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePageByTitle, usePagesSummary, useCreatePage } from "@/hooks/usePageQueries";
import { useNoteTitleIndex } from "@/hooks/useNoteQueries";

interface UseWikiLinkNavigationOptions {
  /**
   * 編集中ページの noteId。`null` はレガシー個人ページ呼び出しの fallback で、
   * Issue #889 Phase 3 で `/pages/:id` ルートが廃止された後は、解決された
   * `foundPage.noteId` を使って `/notes/:noteId/:pageId` に統合的に遷移する。
   * 通常はノート ID を渡す（Issue #713 Phase 4 / #889 Phase 3）。
   *
   * Owning note ID of the page being edited. `null` is kept for legacy
   * personal-page callers, but Issue #889 Phase 3 retired `/pages/:id` so
   * navigation always lands on `/notes/:noteId/:pageId` using the resolved
   * `foundPage.noteId`. Callers normally pass the owning note id.
   */
  pageNoteId: string | null;
}

/**
 * クリック時の追加オプション。`newTab` が `true` のときは `window.open` で
 * 新タブを開き、現在のタブの URL は変更しない（Issue #931）。
 *
 * Click options. When `newTab` is `true`, navigation opens the destination
 * in a new tab via `window.open` and the current tab is left untouched
 * (Issue #931).
 */
interface WikiLinkNavigationOptions {
  newTab?: boolean;
}

interface UseWikiLinkNavigationReturn {
  handleLinkClick: (title: string, options?: WikiLinkNavigationOptions) => void;
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
      return {
        data: null as { id: string; title: string; noteId: string } | null,
        isFetched: true,
      };
    }
    if (personalLookup.data) {
      return {
        data: {
          id: personalLookup.data.id,
          title: personalLookup.data.title,
          noteId: personalLookup.data.noteId,
        },
        isFetched: personalLookup.isFetched,
      };
    }
    const normalized = linkTitleToFind.trim().toLowerCase();
    const list = personalSummary.data ?? [];
    const found = list.find(
      (p) => !p.isDeleted && (p.title ?? "").trim().toLowerCase() === normalized,
    );
    return {
      data: found ? { id: found.id, title: found.title, noteId: found.noteId } : null,
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
  // issue #860 Phase 6: 全ページのタイトルが必要なため `useNoteTitleIndex`
  // を使う（`useInfiniteNotePages` の window では完全集合が保証できない）。
  // タイトル文字列だけが必要で preview / thumbnail は不要なため、`/page-titles`
  // の最小 payload で十分。
  //
  // Issue #860 Phase 6: wiki-link resolution needs the *complete* title set
  // (the windowed `useInfiniteNotePages` would silently miss matches outside
  // the loaded window). Only titles are read, so the `/page-titles` payload
  // is sufficient and avoids paying for preview / thumbnail.
  const noteTitleIndexQuery = useNoteTitleIndex(pageNoteId ?? "", { enabled: Boolean(pageNoteId) });

  const noteLookup = useMemo(() => {
    if (!shouldQueryNote || !linkTitleToFind) {
      return {
        data: null as { id: string; title: string; noteId: string } | null,
        isFetched: true,
      };
    }
    const normalized = linkTitleToFind.trim().toLowerCase();
    const list = noteTitleIndexQuery.data ?? [];
    // 削除済みページは候補から外す（個人スコープのフォールバックが
    // `!p.isDeleted` を見ているので挙動を揃える。Issue #713 Phase 4）。
    // Exclude deleted pages to match the personal fallback and avoid
    // navigating to a tombstone instead of showing the create dialog.
    const found = list.find(
      (p) => !p.isDeleted && (p.title ?? "").trim().toLowerCase() === normalized,
    );
    return {
      // `useNoteTitleIndex` の結果はノート所属が確定しているので noteId は
      // 入力の `pageNoteId` を流用する（!== null は shouldQueryNote で保証済み）。
      // Note-scope hits all belong to `pageNoteId`, so reuse it for the noteId.
      data: found && pageNoteId ? { id: found.id, title: found.title, noteId: pageNoteId } : null,
      isFetched: noteTitleIndexQuery.isFetched,
    };
  }, [
    shouldQueryNote,
    linkTitleToFind,
    noteTitleIndexQuery.data,
    noteTitleIndexQuery.isFetched,
    pageNoteId,
  ]);

  const foundPage = pageNoteId === null ? personalResolved.data : noteLookup.data;
  const isFetched = pageNoteId === null ? personalResolved.isFetched : noteLookup.isFetched;

  // Pending link action
  // Issue #931: `newTab` を保持して既存ページ解決 / ダイアログ確定の両方で
  // window.open ⇔ navigate を切り替える。
  // Issue #931: persist the `newTab` intent so both the existing-page
  // resolution and the create-dialog confirmation can switch between
  // `window.open` and `navigate`.
  const pendingLinkActionRef = useRef<{ title: string; newTab: boolean } | null>(null);
  // ダイアログ確定時に `window.open` を使うかを保存する。Cmd+クリックで
  // ゴーストリンクを開いた場合、ダイアログを通常通り表示しつつ確定後の
  // 遷移だけ新タブにする（Issue #931）。
  // Tracks whether the create-dialog confirmation should open the new
  // page in a new tab. Preserved separately from `pendingLinkActionRef`
  // because that ref is cleared once navigation resolution finishes.
  const pendingCreatePageNewTabRef = useRef<boolean>(false);
  // Issue #931: ユーザー操作の同期スタック内で `window.open("about:blank")`
  // を呼んで取得しておく WindowProxy。後続の `useEffect` / `await` 後の
  // `window.open` はブラウザのポップアップブロッカ（特に Safari / Firefox）
  // でユーザーアクティベーション切れと判定されるため、クリック時に空タブを
  // 確保しておき、解決後に `location.href` を差し替える方式を採用する。
  //
  // Pre-opened `about:blank` WindowProxy captured during the synchronous
  // click handler. Calling `window.open` after a `useEffect` or `await`
  // boundary loses transient user activation, so Safari and Firefox block
  // the popup. Opening synchronously here and updating `location.href`
  // once the navigation target resolves preserves the gesture.
  const pendingNewTabWindowRef = useRef<Window | null>(null);

  // Create page confirmation dialog state
  const [createPageDialogOpen, setCreatePageDialogOpen] = useState(false);
  const [pendingCreatePageTitle, setPendingCreatePageTitle] = useState<string | null>(null);

  // Handle link click - navigate to page or create new
  // WikiLinkクリック時は常に既存ページの存在をチェック（byTitle キャッシュに依存、createdPageIdsRef は廃止）
  const handleLinkClick = useCallback((title: string, options?: WikiLinkNavigationOptions) => {
    const newTab = options?.newTab ?? false;
    if (newTab) {
      // Issue #931: ユーザー操作中に同期で空タブを開く。ポップアップが
      // ブロックされた場合は `null` が返るので後続処理は skip する。
      // Issue #931: open the blank tab synchronously while the user
      // gesture is still live. If the popup is blocked, `window.open`
      // returns `null` and downstream handlers silently no-op.
      pendingNewTabWindowRef.current = window.open("about:blank", "_blank", "noopener,noreferrer");
    }
    pendingLinkActionRef.current = { title, newTab };
    setLinkTitleToFind(title);
  }, []);

  /**
   * 確保した about:blank タブに最終 URL を設定する。`null` の場合（ブロック
   * 済み）は何もしない。
   *
   * Assign the final URL to the previously opened `about:blank` tab.
   * No-op when popup was blocked (`null`).
   */
  const navigateNewTab = useCallback((targetUrl: string) => {
    const w = pendingNewTabWindowRef.current;
    pendingNewTabWindowRef.current = null;
    if (w) {
      w.location.href = targetUrl;
    }
  }, []);

  /**
   * 確保した about:blank タブを閉じる（キャンセル / 失敗 / note-scope no-op 用）。
   *
   * Close the reserved `about:blank` tab. Used by cancel, failed
   * mutations, and the note-scope no-op confirmation path.
   */
  const closePendingNewTabWindow = useCallback(() => {
    const w = pendingNewTabWindowRef.current;
    pendingNewTabWindowRef.current = null;
    w?.close();
  }, []);

  // Navigate when found page changes
  useEffect(() => {
    const handleNavigation = async () => {
      // linkTitleToFindが設定されていない場合は何もしない
      if (!linkTitleToFind || !pendingLinkActionRef.current) return;

      const { title, newTab } = pendingLinkActionRef.current;

      // タイトルが一致しない場合は何もしない
      if (linkTitleToFind !== title) return;

      // クエリがまだ完了していない場合は待機
      if (!isFetched) return;

      // ユーザーがクリックしていない場合は何もしない（初期レンダリング対策）
      if (!title.trim()) return;

      if (foundPage) {
        // Issue #889 Phase 3 で `/pages/:id` が廃止されたため、全ケースで
        // `/notes/:noteId/:pageId` に遷移する。`foundPage.noteId` は
        // 個人スコープ・ノートスコープいずれの解決パスでもセット済み。
        //
        // After Issue #889 Phase 3 retired `/pages/:id`, navigation always
        // targets `/notes/:noteId/:pageId`. Both resolution paths populate
        // `foundPage.noteId` so this branch unifies cleanly.
        const targetUrl = `/notes/${foundPage.noteId}/${foundPage.id}`;
        if (newTab) {
          // Issue #931: クリック時に同期で開いた about:blank タブの location を
          // 上書きする。`window.open` をここで呼ぶとポップアップブロッカに
          // 引っかかるため不可（Safari / Firefox）。
          // Issue #931: rewrite the pre-opened `about:blank` tab. Calling
          // `window.open` here would be blocked by Safari/Firefox popup
          // policies because the user gesture has expired.
          navigateNewTab(targetUrl);
        } else {
          navigate(targetUrl, {
            replace: false,
            flushSync: true,
          });
        }
      } else {
        // ページが見つからなかった場合は確認ダイアログを表示。
        // 新タブ意図はダイアログ確定時に消費するので別 ref に退避する（Issue #931）。
        // 確保済みの about:blank タブはダイアログの確定／キャンセル時に
        // 消費／クローズされる。
        // Stash the new-tab intent so the create-dialog confirmation can
        // honor it later (Issue #931). The reserved `about:blank` window
        // is consumed on confirm or closed on cancel.
        pendingCreatePageNewTabRef.current = newTab;
        setPendingCreatePageTitle(title);
        setCreatePageDialogOpen(true);
      }

      // 状態をクリア
      pendingLinkActionRef.current = null;
      setLinkTitleToFind(null);
    };

    handleNavigation();
  }, [foundPage, isFetched, linkTitleToFind, navigate, navigateNewTab, pageNoteId]);

  // Handle create page confirmation
  // 新規ページ作成は `useCreatePage` 経由でデフォルトノートまたは指定ノートに
  // 作成され、サーバが返す `note_id` を使って `/notes/:noteId/:pageId` に遷移する
  // （Issue #889 Phase 3 で `/pages/:id` 経路は撤去）。ノートスコープ時の
  // 新規作成は別経路（`POST /api/notes/:noteId/pages`）が担うため、現状は
  // 個人デフォルトノートへのフォールバックだけ提供する。
  //
  // After Issue #889 Phase 3 the `/pages/:id` route is gone; `useCreatePage`
  // attaches the new page to the caller's default note and the server returns
  // `note_id`, so navigation always lands on `/notes/:noteId/:pageId`. Note-
  // scoped creation is still handled separately via `POST /api/notes/:noteId/pages`.
  const handleConfirmCreate = useCallback(async () => {
    if (!pendingCreatePageTitle) return;
    if (pageNoteId) {
      // ノートスコープ内での新規作成は未対応。確保済み about:blank タブは
      // 閉じてダイアログだけ閉じる。
      // Note-scope creation is not yet wired up. Close the reserved blank
      // tab so the user is not left with an empty popup.
      closePendingNewTabWindow();
      setCreatePageDialogOpen(false);
      setPendingCreatePageTitle(null);
      pendingCreatePageNewTabRef.current = false;
      return;
    }

    try {
      const newPage = await createPageMutation.mutateAsync({
        title: pendingCreatePageTitle,
        content: "",
      });
      setCreatePageDialogOpen(false);
      setPendingCreatePageTitle(null);
      const targetUrl = `/notes/${newPage.noteId}/${newPage.id}`;
      const newTab = pendingCreatePageNewTabRef.current;
      pendingCreatePageNewTabRef.current = false;
      if (newTab) {
        // Issue #931: クリック時に確保した about:blank タブの location を
        // 上書きする。await 後に `window.open` を呼ぶとポップアップブロッカ
        // でブロックされる（Safari / Firefox / Chrome の strict 設定）。
        // Issue #931: rewrite the pre-opened blank tab. A fresh
        // `window.open` after `await` is treated as a gesture-less popup
        // and blocked.
        navigateNewTab(targetUrl);
      } else {
        navigate(targetUrl, {
          replace: false,
          flushSync: true,
        });
      }
    } catch (error) {
      // ミューテーション失敗時は確保しておいた about:blank タブを閉じて
      // 空白タブが残らないようにする。
      // Close the reserved blank tab on failure to avoid leaving a stray
      // popup behind.
      closePendingNewTabWindow();
      console.error("Failed to create page:", error);
    }
  }, [
    pendingCreatePageTitle,
    createPageMutation,
    navigate,
    navigateNewTab,
    closePendingNewTabWindow,
    pageNoteId,
  ]);

  const handleCancelCreate = useCallback(() => {
    // 確保済み about:blank タブを閉じる（Issue #931）。
    // Close the reserved blank tab so cancelling does not leave a popup.
    closePendingNewTabWindow();
    setCreatePageDialogOpen(false);
    setPendingCreatePageTitle(null);
    pendingCreatePageNewTabRef.current = false;
  }, [closePendingNewTabWindow]);

  return {
    handleLinkClick,
    createPageDialogOpen,
    pendingCreatePageTitle,
    handleConfirmCreate,
    handleCancelCreate,
  };
}
