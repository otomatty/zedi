import { useState, useRef, useEffect, useCallback, useMemo, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useAIChatStore } from "../../stores/aiChatStore";
import { useAIChatContext } from "../../contexts/AIChatContext";
import { usePagesSummary } from "../../hooks/usePageQueries";
import type { ReferencedPage } from "../../types/aiChat";
import { ZEDI_PAGE_MIME_TYPE, MAX_REFERENCED_PAGES } from "../../types/aiChat";
import {
  getEditorContentFromEditor,
  insertChipAtCursorInEditor,
  replaceMentionWithChip,
} from "./aiChatInputHelpers";

interface UseAIChatInputProps {
  onSendMessage: (message: string, referencedPages: ReferencedPage[]) => void;
  /** Overrides default placeholder (e.g. landing page). / 既定プレースホルダーを上書き（ランディング等） */
  placeholderOverride?: string;
  /**
   * Plain text to insert when `prefillNonce` changes (e.g. branch-from-user flow).
   * `prefillNonce` が変わったときに挿入するプレーンテキスト（ユーザーから分岐など）。
   */
  prefillText?: string;
  /**
   * Bump to re-apply `prefillText` and focus the editor (e.g. increment on branch-from-user).
   * 増やすと `prefillText` を再適用してエディタにフォーカス。
   */
  prefillNonce?: number;
  /**
   * Bump to focus the editor without changing content (e.g. branch from assistant node).
   * 内容は変えずエディタにフォーカス（アシスタントから分岐など）。
   */
  focusEditorNonce?: number;
}

/**
 * Page chip state, editor ref, and DOM sync for the AI chat composer (used by {@link useAIChatInput}).
 * AI チャット入力のページチップ状態・エディタ ref・DOM 同期（{@link useAIChatInput} が利用）。
 */
function useAIChatInputChips() {
  const [pendingRefs, setPendingRefs] = useState<ReferencedPage[]>([]);
  const [isEmpty, setIsEmpty] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);

  const syncRefsFromDOM = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const chips = editor.querySelectorAll<HTMLElement>("[data-page-id]");
    const newRefs = Array.from(chips).map((el) => ({
      id: el.dataset.pageId ?? "",
      title: el.dataset.pageTitle ?? "",
    }));
    setPendingRefs((prev) => {
      if (prev.length === newRefs.length && prev.every((r, i) => r.id === newRefs[i]?.id))
        return prev;
      return newRefs;
    });
  }, []);

  const [textLength, setTextLength] = useState(0);

  const checkEmpty = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const text = editor.textContent?.trim() ?? "";
    const hasContent = text !== "" || editor.querySelector("[data-page-id]") !== null;
    setIsEmpty(!hasContent);
    setTextLength(text.length);
  }, []);

  const insertChipAtCursor = useCallback(
    (id: string, title: string) => {
      insertChipAtCursorInEditor(editorRef.current, id, title, () => {
        syncRefsFromDOM();
        checkEmpty();
      });
    },
    [syncRefsFromDOM, checkEmpty],
  );

  const getEditorContent = useCallback(
    (): { text: string; refs: ReferencedPage[] } => getEditorContentFromEditor(editorRef.current),
    [],
  );

  return {
    pendingRefs,
    setPendingRefs,
    isEmpty,
    setIsEmpty,
    textLength,
    editorRef,
    syncRefsFromDOM,
    checkEmpty,
    insertChipAtCursor,
    getEditorContent,
  };
}

/* eslint-disable max-lines-per-function -- Issue #72 Phase 3: chip logic in useAIChatInputChips; mention/submit/dnd in main hook (174 lines) */
/**
 * AI chat composer logic: contenteditable editor, page chips, mention autocomplete, drag-and-drop pages, branch prefill/focus, send.
 * AI チャット入力ロジック：contenteditable、ページチップ、メンション補完、ページの D&D、分岐プリフィル／フォーカス、送信。
 *
 * Chip DOM sync lives in {@link useAIChatInputChips}. Options: {@link UseAIChatInputProps}.
 * チップの DOM 同期は {@link useAIChatInputChips}。引数は {@link UseAIChatInputProps}。
 */
export function useAIChatInput({
  onSendMessage,
  placeholderOverride,
  prefillText = "",
  prefillNonce,
  focusEditorNonce,
}: UseAIChatInputProps) {
  const { t } = useTranslation();
  const chips = useAIChatInputChips();
  const {
    pendingRefs,
    isEmpty,
    textLength,
    editorRef,
    syncRefsFromDOM,
    checkEmpty,
    insertChipAtCursor,
    getEditorContent,
    setPendingRefs,
    setIsEmpty,
  } = chips;
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isDraggingOverRef = useRef(false);
  const { isStreaming, contextEnabled } = useAIChatStore();
  const { pageContext } = useAIChatContext();
  const { data: pages = [] } = usePagesSummary();

  useEffect(() => {
    if (prefillNonce === undefined) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.textContent = prefillText;
    syncRefsFromDOM();
    checkEmpty();
    requestAnimationFrame(() => {
      editor.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }, [prefillNonce, prefillText, syncRefsFromDOM, checkEmpty, editorRef]);

  useEffect(() => {
    if (focusEditorNonce === undefined || focusEditorNonce === 0) return;
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, [focusEditorNonce, editorRef]);

  const deferredMentionQuery = useDeferredValue(mentionQuery);
  const mentionCandidates = useMemo(() => {
    if (deferredMentionQuery === null) return [];
    const q = deferredMentionQuery.toLowerCase();
    const pendingIds = new Set(pendingRefs.map((r) => r.id));
    return pages
      .filter((p) => !p.isDeleted && !pendingIds.has(p.id))
      .filter((p) => {
        const title = (p.title || "無題のページ").toLowerCase();
        return q === "" || title.includes(q);
      })
      .slice(0, 8);
  }, [deferredMentionQuery, pages, pendingRefs]);

  const detectMention = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      setMentionQuery(null);
      return;
    }
    const node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const cursorPos = sel.getRangeAt(0).startOffset;
      const atMatch = text.slice(0, cursorPos).match(/(^|[\s\u00A0])@([^\s@\u00A0]*)$/);
      if (atMatch) {
        setMentionQuery(atMatch[2]);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  }, []);

  const selectMentionPage = useCallback(
    (page: { id: string; title: string }) => {
      const editor = editorRef.current;
      if (!editor) return;
      if (editor.querySelectorAll("[data-page-id]").length >= MAX_REFERENCED_PAGES) {
        setMentionQuery(null);
        return;
      }
      replaceMentionWithChip(editor, page, () => {
        syncRefsFromDOM();
        checkEmpty();
        setMentionQuery(null);
      });
    },
    [syncRefsFromDOM, checkEmpty, editorRef],
  );

  const handleEditorInput = useCallback(() => {
    syncRefsFromDOM();
    checkEmpty();
    detectMention();
  }, [syncRefsFromDOM, checkEmpty, detectMention]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (isStreaming) return;
      const { text, refs } = getEditorContent();
      if (!text) return;
      onSendMessage(text, refs);
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
        checkEmpty();
      } else {
        setIsEmpty(true);
      }
      setPendingRefs([]);
      setMentionQuery(null);
    },
    [
      isStreaming,
      getEditorContent,
      onSendMessage,
      setPendingRefs,
      setIsEmpty,
      checkEmpty,
      editorRef,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (mentionQuery !== null && mentionCandidates.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((prev) => Math.min(prev + 1, mentionCandidates.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = mentionCandidates[mentionIndex];
          if (selected)
            selectMentionPage({ id: selected.id, title: selected.title || "無題のページ" });
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionQuery(null);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [mentionQuery, mentionCandidates, mentionIndex, selectMentionPage, handleSubmit],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (text) document.execCommand("insertText", false, text);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ZEDI_PAGE_MIME_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "link";
      if (!isDraggingOverRef.current) {
        isDraggingOverRef.current = true;
        setIsDraggingOver(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    isDraggingOverRef.current = false;
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      isDraggingOverRef.current = false;
      setIsDraggingOver(false);
      const raw = e.dataTransfer.getData(ZEDI_PAGE_MIME_TYPE);
      if (!raw) return;
      try {
        const { id, title } = JSON.parse(raw) as { id: string; title: string };
        const editor = editorRef.current;
        if (!editor || editor.querySelector(`[data-page-id="${CSS.escape(id)}"]`)) return;
        if (editor.querySelectorAll("[data-page-id]").length >= MAX_REFERENCED_PAGES) return;
        insertChipAtCursor(id, title);
      } catch {
        // ignore
      }
    },
    [insertChipAtCursor, editorRef],
  );

  const placeholder =
    placeholderOverride ??
    (contextEnabled && pageContext?.type === "editor"
      ? t("aiChat.placeholders.withContext")
      : t("aiChat.placeholders.default"));

  return {
    editorRef,
    dropdownRef,
    isEmpty,
    textLength,
    isStreaming,
    isDraggingOver,
    placeholder,
    showMentionDropdown: mentionQuery !== null && mentionCandidates.length > 0,
    mentionCandidates,
    mentionIndex,
    setMentionIndex,
    selectMentionPage,
    handleEditorInput,
    handleSubmit,
    handleKeyDown,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
