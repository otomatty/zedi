import { useState, useEffect, useCallback, useRef } from "react";
import { useCheckDuplicateTitle } from "./usePageQueries";
import type { Page } from "@/types/page";

interface TitleValidationState {
  /** 重複しているページ（存在する場合） */
  duplicatePage: Page | null;
  /** バリデーション中かどうか */
  isValidating: boolean;
  /** タイトルが空かどうか */
  isEmpty: boolean;
  /** エラーメッセージ */
  errorMessage: string | null;
}

interface UseTitleValidationOptions {
  /** 現在編集中のページID（既存ページの場合） */
  currentPageId?: string;
  /** 新規作成かどうか */
  isNewPage: boolean;
  /** デバウンス遅延（ミリ秒） */
  debounceMs?: number;
}

/**
 * タイトルの重複チェックと空タイトル検証を行うカスタムフック
 */
export function useTitleValidation(options: UseTitleValidationOptions) {
  const { currentPageId, isNewPage, debounceMs = 300 } = options;
  const { checkDuplicate, isLoaded } = useCheckDuplicateTitle();

  const [state, setState] = useState<TitleValidationState>({
    duplicatePage: null,
    isValidating: false,
    isEmpty: true,
    errorMessage: null,
  });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckedTitleRef = useRef<string>("");

  /**
   * タイトルを検証する
   */
  const validateTitle = useCallback(
    async (title: string) => {
      const trimmedTitle = title.trim();

      // 空タイトルの場合
      if (!trimmedTitle) {
        setState({
          duplicatePage: null,
          isValidating: false,
          isEmpty: true,
          errorMessage: isNewPage ? null : "タイトルを入力してください",
        });
        return;
      }

      // 同じタイトルをチェック済みならスキップ
      if (trimmedTitle === lastCheckedTitleRef.current) {
        return;
      }

      setState((prev) => ({ ...prev, isValidating: true, isEmpty: false }));

      // デバウンス
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        if (!isLoaded) return;

        lastCheckedTitleRef.current = trimmedTitle;
        const duplicate = await checkDuplicate(trimmedTitle, currentPageId);

        setState({
          duplicatePage: duplicate,
          isValidating: false,
          isEmpty: false,
          errorMessage: duplicate
            ? `「${duplicate.title}」というタイトルのページが既に存在します`
            : null,
        });
      }, debounceMs);
    },
    [checkDuplicate, currentPageId, isLoaded, isNewPage, debounceMs]
  );

  /**
   * 既存ページ読み込み時にタイトル状態を初期化する
   * （重複チェックは行わない）
   */
  const initializeWithTitle = useCallback((title: string) => {
    const trimmedTitle = title.trim();
    lastCheckedTitleRef.current = trimmedTitle;
    setState({
      duplicatePage: null,
      isValidating: false,
      isEmpty: !trimmedTitle,
      errorMessage: null,
    });
  }, []);

  /**
   * バリデーション状態をリセット
   */
  const resetValidation = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    lastCheckedTitleRef.current = "";
    setState({
      duplicatePage: null,
      isValidating: false,
      isEmpty: true,
      errorMessage: null,
    });
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    ...state,
    validateTitle,
    initializeWithTitle,
    resetValidation,
    /** 保存をブロックすべきかどうか */
    shouldBlockSave: state.duplicatePage !== null,
    /** 警告を表示すべきかどうか */
    showWarning: state.duplicatePage !== null || (!isNewPage && state.isEmpty),
  };
}
