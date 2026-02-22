import React, { useState, useRef, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { Send, Square, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIChatStore } from '../../stores/aiChatStore';
import { useAIChatContext } from '../../contexts/AIChatContext';
import { usePagesSummary } from '../../hooks/usePageQueries';
import type { ReferencedPage } from '../../types/aiChat';
import { ZEDI_PAGE_MIME_TYPE, MAX_REFERENCED_PAGES } from '../../types/aiChat';
import { cn } from '../../lib/utils';

// FileText SVG for inline chip icons (Lucide icon paths)
const FILE_TEXT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';

/** contentEditable 内に挿入するインラインチップ要素を生成 */
function createChipElement(id: string, title: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.dataset.pageId = id;
  chip.dataset.pageTitle = title;
  chip.className =
    'inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded bg-primary/10 text-primary text-xs align-middle cursor-default select-none';
  chip.innerHTML = FILE_TEXT_SVG + '<span class="truncate max-w-[120px]">' + escapeHtml(title) + '</span>';
  return chip;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface AIChatInputProps {
  onSendMessage: (message: string, referencedPages: ReferencedPage[]) => void;
  onStopStreaming: () => void;
}

export function AIChatInput({ onSendMessage, onStopStreaming }: AIChatInputProps) {
  const { t } = useTranslation();
  const [pendingRefs, setPendingRefs] = useState<ReferencedPage[]>([]);
  const [isEmpty, setIsEmpty] = useState(true);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isDraggingOverRef = useRef(false);
  const { isStreaming, contextEnabled, pendingPageToAdd, setPendingPageToAdd } = useAIChatStore();
  const { pageContext } = useAIChatContext();
  const { data: pages = [] } = usePagesSummary();

  // --- DOM helpers ---

  /** エディタ内のチップ要素からrefsを同期 */
  const syncRefsFromDOM = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const chips = editor.querySelectorAll<HTMLElement>('[data-page-id]');
    const newRefs = Array.from(chips).map((el) => ({
      id: el.dataset.pageId!,
      title: el.dataset.pageTitle!,
    }));
    setPendingRefs((prev) => {
      if (prev.length === newRefs.length && prev.every((r, i) => r.id === newRefs[i]?.id)) return prev;
      return newRefs;
    });
  }, []);

  /** エディタが空かどうかを判定 */
  const checkEmpty = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const hasContent =
      (editor.textContent?.trim() ?? '') !== '' || editor.querySelector('[data-page-id]') !== null;
    setIsEmpty(!hasContent);
  }, []);

  /** カーソル位置（またはエディタ末尾）にチップを挿入 */
  const insertChipAtCursor = useCallback(
    (id: string, title: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      const chip = createChipElement(id, title);
      const sel = window.getSelection();
      let inserted = false;

      if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(chip);
        inserted = true;
      }

      if (!inserted) {
        editor.appendChild(chip);
      }

      // チップ後にスペースを挿入してカーソルを配置
      const spacer = document.createTextNode('\u00A0');
      chip.after(spacer);

      const cursorSel = window.getSelection();
      if (cursorSel) {
        const r = document.createRange();
        r.setStartAfter(spacer);
        r.collapse(true);
        cursorSel.removeAllRanges();
        cursorSel.addRange(r);
      }

      syncRefsFromDOM();
      checkEmpty();
      editor.focus();
    },
    [syncRefsFromDOM, checkEmpty],
  );

  // --- 外部からの参照追加（コンテキストメニュー） ---
  useEffect(() => {
    if (!pendingPageToAdd) return;
    const { id, title } = pendingPageToAdd;
    setPendingPageToAdd(null);

    const editor = editorRef.current;
    if (editor?.querySelector(`[data-page-id="${CSS.escape(id)}"]`)) return;
    const chips = editor?.querySelectorAll('[data-page-id]');
    if (chips && chips.length >= MAX_REFERENCED_PAGES) return;

    insertChipAtCursor(id, title);
  }, [pendingPageToAdd, setPendingPageToAdd, insertChipAtCursor]);

  // --- @メンション ---

  const deferredMentionQuery = useDeferredValue(mentionQuery);
  const mentionCandidates = useMemo(() => {
    if (deferredMentionQuery === null) return [];
    const q = deferredMentionQuery.toLowerCase();
    const pendingIds = new Set(pendingRefs.map((r) => r.id));
    return pages
      .filter((p) => !p.isDeleted && !pendingIds.has(p.id))
      .filter((p) => {
        const title = (p.title || '無題のページ').toLowerCase();
        return q === '' || title.includes(q);
      })
      .slice(0, 8);
  }, [deferredMentionQuery, pages, pendingRefs]);

  /** カーソル位置のテキストノードから @query を検出 */
  const detectMention = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      setMentionQuery(null);
      return;
    }
    const node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const cursorPos = sel.getRangeAt(0).startOffset;
      const beforeCursor = text.slice(0, cursorPos);
      const atMatch = beforeCursor.match(/(^|[\s\u00A0])@([^\s@\u00A0]*)$/);
      if (atMatch) {
        setMentionQuery(atMatch[2]);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  }, []);

  /** ドロップダウンからページを選択 → @query をチップに置換 */
  const selectMentionPage = useCallback(
    (page: { id: string; title: string }) => {
      const editor = editorRef.current;
      if (!editor) return;

      const existingChips = editor.querySelectorAll('[data-page-id]');
      if (existingChips.length >= MAX_REFERENCED_PAGES) {
        setMentionQuery(null);
        return;
      }

      const title = page.title || '無題のページ';
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) {
        setMentionQuery(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) {
        setMentionQuery(null);
        return;
      }

      const text = node.textContent || '';
      const cursorPos = range.startOffset;
      const beforeCursor = text.slice(0, cursorPos);
      const lastAt = beforeCursor.lastIndexOf('@');
      if (lastAt < 0) {
        setMentionQuery(null);
        return;
      }

      // Range API で @query を削除してチップを挿入
      const chip = createChipElement(page.id, title);
      const deleteRange = document.createRange();
      deleteRange.setStart(node, lastAt);
      deleteRange.setEnd(node, cursorPos);
      deleteRange.deleteContents();
      deleteRange.insertNode(chip);

      // チップ後にスペースを追加
      const spacer = document.createTextNode('\u00A0');
      chip.after(spacer);

      const newRange = document.createRange();
      newRange.setStartAfter(spacer);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      syncRefsFromDOM();
      checkEmpty();
      setMentionQuery(null);
    },
    [syncRefsFromDOM, checkEmpty],
  );

  // --- イベントハンドラ ---

  const handleEditorInput = useCallback(() => {
    syncRefsFromDOM();
    checkEmpty();
    detectMention();
  }, [syncRefsFromDOM, checkEmpty, detectMention]);

  /** エディタの内容をテキスト＋参照ページとして取得 */
  const getEditorContent = useCallback((): { text: string; refs: ReferencedPage[] } => {
    const editor = editorRef.current;
    if (!editor) return { text: '', refs: [] };

    let text = '';
    const refs: ReferencedPage[] = [];

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node instanceof HTMLElement) {
        if (node.dataset.pageId) {
          refs.push({ id: node.dataset.pageId, title: node.dataset.pageTitle || '' });
          text += `@${node.dataset.pageTitle || ''}`;
        } else if (node.tagName === 'BR') {
          text += '\n';
        } else if (node.tagName === 'DIV' || node.tagName === 'P') {
          if (text.length > 0 && !text.endsWith('\n')) text += '\n';
          node.childNodes.forEach(walk);
        } else {
          node.childNodes.forEach(walk);
        }
      }
    };
    editor.childNodes.forEach(walk);

    text = text.replace(/\u00A0/g, ' ').trim();
    return { text, refs };
  }, []);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (isStreaming) return;

      const { text, refs } = getEditorContent();
      if (!text) return;

      onSendMessage(text, refs);

      if (editorRef.current) editorRef.current.innerHTML = '';
      setPendingRefs([]);
      setIsEmpty(true);
      setMentionQuery(null);
    },
    [isStreaming, getEditorContent, onSendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // @メンションドロップダウンが開いている場合
      if (mentionQuery !== null && mentionCandidates.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((prev) => Math.min(prev + 1, mentionCandidates.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const selected = mentionCandidates[mentionIndex];
          if (selected) {
            selectMentionPage({ id: selected.id, title: selected.title || '無題のページ' });
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionQuery(null);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [mentionQuery, mentionCandidates, mentionIndex, selectMentionPage, handleSubmit],
  );

  /** ペースト時はプレーンテキストのみ挿入 */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
  }, []);

  // --- D&D handlers ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ZEDI_PAGE_MIME_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
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
        if (!editor) return;
        if (editor.querySelector(`[data-page-id="${CSS.escape(id)}"]`)) return;
        if (editor.querySelectorAll('[data-page-id]').length >= MAX_REFERENCED_PAGES) return;
        insertChipAtCursor(id, title);
      } catch {
        // ignore
      }
    },
    [insertChipAtCursor],
  );

  const placeholder =
    contextEnabled && pageContext?.type === 'editor'
      ? t('aiChat.placeholders.withContext')
      : t('aiChat.placeholders.default');

  const showMentionDropdown = mentionQuery !== null && mentionCandidates.length > 0;

  return (
    <div className="relative">
      {/* @Mention dropdown */}
      {showMentionDropdown && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-[240px] overflow-y-auto"
        >
          {mentionCandidates.map((page, idx) => (
            <button
              key={page.id}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
                idx === mentionIndex && 'bg-accent',
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                selectMentionPage({ id: page.id, title: page.title || '無題のページ' });
              }}
              onMouseEnter={() => setMentionIndex(idx)}
            >
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{page.title || '無題のページ'}</span>
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={cn(
          'relative flex items-end gap-2 bg-background border rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary transition-all',
          isDraggingOver && 'ring-2 ring-primary border-primary bg-primary/5',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex-1 relative min-w-0">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-placeholder={placeholder}
            onInput={handleEditorInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="max-h-[120px] min-h-[24px] overflow-y-auto bg-transparent p-1 text-sm outline-none whitespace-pre-wrap [word-break:break-word]"
          />
          {isEmpty && (
            <div className="absolute inset-0 p-1 text-sm text-muted-foreground pointer-events-none truncate">
              {placeholder}
            </div>
          )}
        </div>

        {isStreaming ? (
          <button
            type="button"
            onClick={onStopStreaming}
            className="p-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors shrink-0"
            title={t('aiChat.actions.stop')}
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={isEmpty}
            className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            title={t('aiChat.actions.send')}
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* Drop overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-lg pointer-events-none z-10">
          <span className="text-xs text-primary font-medium">{t('aiChat.referencedPages.dropHint')}</span>
        </div>
      )}
    </div>
  );
}
