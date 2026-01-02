import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  usePageByTitle,
  useCreatePage,
} from "@/hooks/usePageQueries";

interface UseWikiLinkNavigationReturn {
  handleLinkClick: (title: string, exists: boolean) => void;
  createPageDialogOpen: boolean;
  pendingCreatePageTitle: string | null;
  handleConfirmCreate: () => Promise<void>;
  handleCancelCreate: () => void;
}

/**
 * Hook to handle WikiLink navigation
 * When a WikiLink is clicked, it checks if the page exists and either navigates to it
 * or shows a dialog to create a new page
 */
export function useWikiLinkNavigation(): UseWikiLinkNavigationReturn {
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const [linkTitleToFind, setLinkTitleToFind] = useState<string | null>(null);
  const { data: foundPage, isFetched } = usePageByTitle(linkTitleToFind || "");

  // Pending link action
  const pendingLinkActionRef = useRef<{
    title: string;
    exists: boolean;
  } | null>(null);

  // Create page confirmation dialog state
  const [createPageDialogOpen, setCreatePageDialogOpen] = useState(false);
  const [pendingCreatePageTitle, setPendingCreatePageTitle] = useState<
    string | null
  >(null);

  // Handle link click - navigate to page or create new
  // WikiLinkクリック時は常に既存ページの存在をチェック
  const handleLinkClick = useCallback(
    async (title: string, _exists: boolean) => {
      // まず既存ページを検索（タイトルの完全一致）
      pendingLinkActionRef.current = { title, exists: true };
      setLinkTitleToFind(title);
    },
    []
  );

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
        // 既存ページが見つかった場合はそのページに移動
        navigate(`/page/${foundPage.id}`);
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
  }, [foundPage, isFetched, linkTitleToFind, navigate]);

  // Handle create page confirmation
  const handleConfirmCreate = useCallback(async () => {
    if (!pendingCreatePageTitle) return;

    try {
      const newPage = await createPageMutation.mutateAsync({
        title: pendingCreatePageTitle,
        content: "",
      });
      setCreatePageDialogOpen(false);
      setPendingCreatePageTitle(null);
      navigate(`/page/${newPage.id}`);
    } catch (error) {
      console.error("Failed to create page:", error);
    }
  }, [pendingCreatePageTitle, createPageMutation, navigate]);

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
