import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { sanitizeTiptapContent } from "@/lib/contentUtils";
import { useContentSanitizer } from "./useContentSanitizer";
import { useWikiLinkStatusSync } from "./useWikiLinkStatusSync";
import { useTagStatusSync } from "./useTagStatusSync";
import { usePasteImageHandler } from "./usePasteImageHandler";
import { applyWikiLinkMarksToEditor } from "../extensions/applyWikiLinkMarksToEditor";

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
  /**
   * Issue #880 Phase B: 初期同期完了後に `[[Title]]` プレーンテキストを一度だけ
   * `wikiLink` mark 化したかを記録する。エディタ／ページが変わった場合は
   * 別効果で false にリセットされる。
   *
   * Issue #880 Phase B: tracks whether the post-sync `[[Title]]` → wikiLink
   * mark normalization already ran on the current editor/page combination.
   */
  const wikiLinkNormalizationAppliedRef = useRef(false);

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

  // Issue #880 Phase B: Hocuspocus からロードされた既存 Y.Doc に含まれる plain
  // text `[[Title]]` を、初期同期完了直後に一度だけ `wikiLink` mark へ昇格する。
  // - collaborative mode の場合のみ実行（local mode は paste 時に既に mark 化される）。
  // - `setContent` を使わず ProseMirror transaction で `addMark` のみ呼ぶことで
  //   Y.Doc 構造を壊さない。
  // - `useWikiLinkStatusSync` は mark 後の `exists/referenced/targetId` を更新する。
  //
  // Issue #880 Phase B: promote plain `[[Title]]` text inside the
  // Hocuspocus-loaded Y.Doc to `wikiLink` marks once, immediately after the
  // initial sync completes. Collaborative mode only — local mode marks links
  // at paste time via `WikiLinkExtension`. The downstream `useWikiLinkStatusSync`
  // hook then fills in `exists/referenced/targetId`.
  // `collaborationConfig` は親側で毎回 new されるが、判定に必要なのは isSynced
  // フラグだけなのでプリミティブで dep に積む。これで effect の再実行が必要
  // 以上に走らない。
  // The `collaborationConfig` object is rebuilt on every parent render; key
  // the effect on the boolean `isSynced` flag so the effect doesn't tear down
  // and re-arm the timer needlessly.
  // editor インスタンスまたは pageId が切り替わったら、normalization 履歴を
  // リセットして新しい文書でも一度だけ走るようにする。useRef はマウント中
  // 値を保持するため、ページ遷移しても明示的に false に戻す必要がある。
  // Reset the one-shot guard when the editor instance or page changes so a
  // navigated-to page also runs the normalization once. `useRef` persists
  // across renders, so without this reset a stale `true` would block the
  // post-sync pass on the next page.
  useEffect(() => {
    wikiLinkNormalizationAppliedRef.current = false;
  }, [editor, pageId]);

  const isCollabSynced = Boolean(collaborationConfig?.isSynced);
  useEffect(() => {
    if (!editor || !isCollabSynced) return;
    if (wikiLinkNormalizationAppliedRef.current) return;

    // editor mount 直後だと PM doc がまだ最終形に落ちていないことがあるため、
    // 1 tick 待ってから走査する。`useContentSanitizer` の初期化フローや、
    // Hocuspocus からの Y.Doc 反映の最終ステップが完了してから実行したい。
    // Defer one microtask so the editor finishes binding to the synced Y.Doc
    // before we scan it. Matches the deferral pattern used for `initialContent`.
    const timer = setTimeout(() => {
      // ガードはタイマ起動時ではなく実際に走った時点で flip する。effect
      // クリーンアップで timer が解除された場合に「未実行なのに guard=true」
      // 状態を残さないため。
      // Flip the guard inside the timer (not when scheduling it) so a cleanup
      // that cancels the timer does not leave the guard armed and silently
      // skip the real run forever.
      if (wikiLinkNormalizationAppliedRef.current) return;
      wikiLinkNormalizationAppliedRef.current = true;
      try {
        // `applyWikiLinkMarksToEditor` 内の `editor.view.dispatch(tr)` が
        // Tiptap の `onUpdate` を発火し、上位 (`useEditorSetup`) で
        // `onChange(JSON.stringify(editor.getJSON()))` が呼ばれる。
        // ここで明示的に呼ぶと二重呼び出しになるため呼ばない。
        // The dispatch inside `applyWikiLinkMarksToEditor` triggers Tiptap's
        // `onUpdate`, which already invokes `onChange` upstream. Calling it
        // again here would double-fire the downstream state update.
        applyWikiLinkMarksToEditor(editor);
      } catch (e) {
        console.error("[WikiLinkNormalize] Failed to normalize post-sync marks", e);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [editor, isCollabSynced]);

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
