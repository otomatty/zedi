import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { sanitizeTiptapContent } from "@/lib/contentUtils";
import { useContentSanitizer } from "./useContentSanitizer";
import { useWikiLinkStatusSync } from "./useWikiLinkStatusSync";
import { useTagStatusSync } from "./useTagStatusSync";
import { usePasteImageHandler } from "./usePasteImageHandler";

import { rememberSlashAgentSelection } from "@/lib/agentSlashCommands/slashAgentSelectionCache";
import type { TiptapEditorProps } from "./types";

interface UseEditorLifecycleOptions {
  editor: Editor | null;
  content: TiptapEditorProps["content"];
  onChange: TiptapEditorProps["onChange"];
  onContentError: TiptapEditorProps["onContentError"];
  isReadOnly: boolean;
  pageId: string;
  isWikiGenerating?: boolean;
  collaborationConfig: TiptapEditorProps["collaborationConfig"];
  focusContentRef: TiptapEditorProps["focusContentRef"];
  insertAtCursorRef: TiptapEditorProps["insertAtCursorRef"];
  initialContent: TiptapEditorProps["initialContent"];
  onInitialContentApplied: TiptapEditorProps["onInitialContentApplied"];
  wikiContentForCollab: TiptapEditorProps["wikiContentForCollab"];
  onWikiContentApplied: TiptapEditorProps["onWikiContentApplied"];
  handleImageUpload: (files: FileList | File[]) => void;
  isEditorInitializedRef: React.MutableRefObject<boolean>;
  /**
   * 編集中ページの noteId。WikiLink 存在確認のスコープを切り替える
   * （Issue #713 Phase 4）。
   * Owning note ID of the page being edited; scopes WikiLink existence
   * checks (issue #713 Phase 4).
   */
  pageNoteId: TiptapEditorProps["pageNoteId"];
}

/**
 * エディタのライフサイクル管理（コンテンツ同期・読み取り専用切替・画像ペースト・WikiLink 同期）。
 * マークダウンペーストは MarkdownPasteExtension（ProseMirror プラグイン）が担当する。
 * Manages editor lifecycle: content sync, read-only toggling, image paste handling, and WikiLink status sync.
 * Markdown paste is handled by MarkdownPasteExtension (ProseMirror plugin).
 */
export function useEditorLifecycle({
  editor,
  content,
  onChange,
  onContentError,
  isReadOnly,
  pageId,
  isWikiGenerating = false,
  collaborationConfig,
  focusContentRef,
  insertAtCursorRef,
  initialContent,
  onInitialContentApplied,
  wikiContentForCollab,
  onWikiContentApplied,
  handleImageUpload,
  isEditorInitializedRef,
  pageNoteId,
}: UseEditorLifecycleOptions) {
  const initialContentAppliedRef = useRef(false);

  useEffect(() => {
    if (!editor) return;
    const onSelection = () => rememberSlashAgentSelection(editor);
    editor.on("selectionUpdate", onSelection);
    return () => {
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor]);

  useEffect(() => {
    if (!focusContentRef || !editor) return;
    focusContentRef.current = () => editor.commands.focus();
    return () => {
      focusContentRef.current = null;
    };
  }, [editor, focusContentRef]);

  useEffect(() => {
    if (!insertAtCursorRef || !editor) return;
    insertAtCursorRef.current = (content: unknown) => {
      return editor
        .chain()
        .focus()
        .insertContent(content as Parameters<typeof editor.commands.insertContent>[0])
        .run();
    };
    return () => {
      insertAtCursorRef.current = null;
    };
  }, [editor, insertAtCursorRef]);

  useEffect(() => {
    if (!editor || !collaborationConfig || !initialContent || initialContentAppliedRef.current)
      return;
    const timer = setTimeout(() => {
      if (initialContentAppliedRef.current) return;
      // ProseMirror empty doc (doc + one empty paragraph) has nodeSize 4, not 2
      const doc = editor.state.doc;
      const isEmpty =
        doc.nodeSize <= 4 || (doc.childCount === 1 && (doc.firstChild?.content.size ?? 0) === 0);
      if (!isEmpty) return;
      try {
        editor.commands.setContent(JSON.parse(initialContent));
        initialContentAppliedRef.current = true;
        onInitialContentApplied?.();
      } catch (e) {
        console.error("Failed to apply initial content from URL clip", e);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [editor, collaborationConfig, initialContent, onInitialContentApplied]);

  // コラボモード時: Wiki生成内容を Y.Doc に反映する専用経路（content prop は useContentSanitizer でスキップされるため）
  useEffect(() => {
    if (!editor || !collaborationConfig || !wikiContentForCollab) return;
    try {
      const sanitizeResult = sanitizeTiptapContent(wikiContentForCollab);
      const parsed = JSON.parse(sanitizeResult.content);
      const currentContent = JSON.stringify(editor.getJSON());
      if (currentContent !== sanitizeResult.content) {
        editor.commands.setContent(parsed);
        isEditorInitializedRef.current = true;
        onWikiContentApplied?.();
      }
    } catch (e) {
      console.error("[Wiki] Failed to apply wiki content in collab mode", e);
      onWikiContentApplied?.();
    }
  }, [
    editor,
    collaborationConfig,
    wikiContentForCollab,
    onWikiContentApplied,
    isEditorInitializedRef,
  ]);

  // Issue #880 Phase B リグレッション対応 (#882):
  // 旧実装では初期同期完了直後にクライアント側で
  // `applyWikiLinkMarksToEditor` を呼び、未 mark の `[[Title]]` を
  // ProseMirror トランザクション経由で `wikiLink` mark に昇格していたが、
  // y-prosemirror が多数 mark を一括同期する境界で lib0 の
  // `unexpectedCase` を踏み、editor view ごと破壊されるリグレッションが
  // 発生した。サーバ側 (Hocuspocus `onLoadDocument` および
  // `GET /api/pages/:id/content` / `PUT /api/pages/:id/content`) で
  // `applyWikiLinkMarksToYDoc` による正規化を行うように移行したため、
  // クライアントの post-sync 正規化は不要となり撤去した。
  //
  // The post-sync client normalization that called
  // `applyWikiLinkMarksToEditor` here used to trigger a y-prosemirror
  // `unexpectedCase` boundary case on large multi-mark dispatches (Issue
  // #880 Phase B regression). Normalization now happens server-side
  // (Hocuspocus on-load + API GET/PUT via `applyWikiLinkMarksToYDoc`), so
  // the client never receives an un-promoted `[[Title]]` plain text from a
  // synced document.

  usePasteImageHandler({ editor, handleImageUpload });

  useEffect(() => {
    if (editor) editor.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  useContentSanitizer({
    editor,
    content,
    onError: onContentError,
    onContentUpdated: (initialized) => {
      if (initialized) isEditorInitializedRef.current = true;
    },
    isCollaborationMode: !!collaborationConfig,
  });

  useWikiLinkStatusSync({
    editor,
    content,
    pageId: pageId || undefined,
    onChange,
    skipSync: isWikiGenerating,
    pageNoteId: pageNoteId ?? null,
  });

  // issue #725 Phase 1: tag Mark の `exists` / `referenced` を同じ契約で同期する。
  // Keep tag marks' status in sync alongside WikiLink marks (issue #725 Phase 1).
  useTagStatusSync({
    editor,
    content,
    pageId: pageId || undefined,
    onChange,
    skipSync: isWikiGenerating,
    pageNoteId: pageNoteId ?? null,
  });
}
