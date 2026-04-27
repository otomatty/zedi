import { useState, useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/core";
import {
  wikiLinkSuggestionPluginKey,
  type WikiLinkSuggestionState,
} from "../extensions/wikiLinkSuggestionPlugin";
import {
  slashSuggestionPluginKey,
  type SlashSuggestionState,
} from "../extensions/slashSuggestionPlugin";
import { tagSuggestionPluginKey, type TagSuggestionState } from "../extensions/tagSuggestionPlugin";
import type { SuggestionItem } from "../extensions/WikiLinkSuggestion";
import type { TagSuggestionItem } from "../extensions/TagSuggestion";
import { useCheckGhostLinkReferenced } from "@/hooks/usePageQueries";

interface UseSuggestionEffectsOptions {
  editor: Editor | null;
  suggestionState: WikiLinkSuggestionState | null;
  slashState: SlashSuggestionState | null;
  tagSuggestionState: TagSuggestionState | null;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  pageId: string;
  handleInsertImageClick: () => void;
  handleInsertCameraImageClick: () => void;
}

/**
 *
 */
export function useSuggestionEffects({
  editor,
  suggestionState,
  slashState,
  tagSuggestionState,
  editorContainerRef,
  pageId,
  handleInsertImageClick,
  handleInsertCameraImageClick,
}: UseSuggestionEffectsOptions) {
  /**
   *
   */
  const { checkReferenced } = useCheckGhostLinkReferenced();
  /**
   *
   */
  const [suggestionPos, setSuggestionPos] = useState<{ top: number; left: number } | null>(null);
  /**
   *
   */
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  /**
   * Floating popover position for the `#name` tag suggestion. Issue #767 (Phase 2).
   * `#name` タグサジェスト用のフローティング表示位置（issue #767 Phase 2）。
   */
  const [tagSuggestionPos, setTagSuggestionPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // 依存はプリミティブに限定。suggestionState 自体は毎レンダーで新しい参照になるため
  // オブジェクトを依存にすると setState → 再レンダ → effect 再実行の無限ループになる。
  /**
   *
   */
  const suggestionActive = suggestionState?.active ?? false;
  /**
   *
   */
  const suggestionFrom = suggestionState?.range?.from ?? null;
  /**
   *
   */
  const suggestionTo = suggestionState?.range?.to ?? null;

  useEffect(() => {
    if (!editor || !suggestionActive || suggestionFrom === null) {
      queueMicrotask(() => setSuggestionPos(null));
      return;
    }
    /**
     *
     */
    const coords = editor.view.coordsAtPos(suggestionFrom);
    /**
     *
     */
    const containerRect = editorContainerRef.current?.getBoundingClientRect();
    if (containerRect) {
      queueMicrotask(() =>
        setSuggestionPos({
          top: coords.bottom - containerRect.top + 4,
          left: coords.left - containerRect.left,
        }),
      );
    }
  }, [editor, suggestionActive, suggestionFrom, suggestionTo, editorContainerRef]);

  /**
   *
   */
  const slashActive = slashState?.active ?? false;
  /**
   *
   */
  const slashFrom = slashState?.range?.from ?? null;
  /**
   *
   */
  const slashTo = slashState?.range?.to ?? null;

  useEffect(() => {
    if (!editor || !slashActive || slashFrom === null) {
      queueMicrotask(() => setSlashPos(null));
      return;
    }
    /**
     *
     */
    const coords = editor.view.coordsAtPos(slashFrom);
    /**
     *
     */
    const containerRect = editorContainerRef.current?.getBoundingClientRect();
    if (containerRect) {
      queueMicrotask(() =>
        setSlashPos({
          top: coords.bottom - containerRect.top + 4,
          left: coords.left - containerRect.left,
        }),
      );
    }
  }, [editor, slashActive, slashFrom, slashTo, editorContainerRef]);

  // Tag suggestion position. WikiLink / Slash と同じプリミティブ依存パターン。
  // Tag suggestion popover position; same primitive-dependency pattern.
  const tagActive = tagSuggestionState?.active ?? false;
  const tagFrom = tagSuggestionState?.range?.from ?? null;
  const tagTo = tagSuggestionState?.range?.to ?? null;

  useEffect(() => {
    if (!editor || !tagActive || tagFrom === null) {
      queueMicrotask(() => setTagSuggestionPos(null));
      return;
    }
    const coords = editor.view.coordsAtPos(tagFrom);
    const containerRect = editorContainerRef.current?.getBoundingClientRect();
    if (containerRect) {
      queueMicrotask(() =>
        setTagSuggestionPos({
          top: coords.bottom - containerRect.top + 4,
          left: coords.left - containerRect.left,
        }),
      );
    }
  }, [editor, tagActive, tagFrom, tagTo, editorContainerRef]);

  useEffect(() => {
    /**
     *
     */
    const handler = () => handleInsertImageClick();
    window.addEventListener("slash-command-insert-image", handler);
    return () => window.removeEventListener("slash-command-insert-image", handler);
  }, [handleInsertImageClick]);

  useEffect(() => {
    /**
     *
     */
    const handler = () => handleInsertCameraImageClick();
    window.addEventListener("slash-command-insert-camera-image", handler);
    return () => window.removeEventListener("slash-command-insert-camera-image", handler);
  }, [handleInsertCameraImageClick]);

  /**
   *
   */
  const handleSuggestionSelect = useCallback(
    async (item: SuggestionItem) => {
      if (!editor || !suggestionState?.range) return;
      /**
       *
       */
      const { from, to } = suggestionState.range;
      /**
       *
       */
      let referenced = false;
      if (!item.exists) {
        referenced = await checkReferenced(item.title, pageId);
      }
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent([
          {
            type: "text",
            marks: [
              {
                type: "wikiLink",
                attrs: { title: item.title, exists: item.exists, referenced },
              },
            ],
            text: `[[${item.title}]]`,
          },
        ])
        .run();
      editor.view.dispatch(
        editor.view.state.tr.setMeta(wikiLinkSuggestionPluginKey, { close: true }),
      );
    },
    [editor, suggestionState, checkReferenced, pageId],
  );

  /**
   *
   */
  const handleSuggestionClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.view.state.tr.setMeta(wikiLinkSuggestionPluginKey, { close: true }),
    );
  }, [editor]);

  /**
   *
   */
  const handleSlashClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(editor.view.state.tr.setMeta(slashSuggestionPluginKey, { close: true }));
  }, [editor]);

  /**
   * Tag (`#name`) サジェスト確定。範囲を `#name` に置換し、`tag` Mark を直接
   * 付与する。`exists` / `targetId` は候補側で解決済みの値を流す（issue #767）。
   * 解決失敗時は `referenced` を ghost_links から取得して埋める（WikiLink と
   * 同じ手順）。
   *
   * Confirm a tag (`#name`) suggestion: replace the typed range with the
   * styled mark and use the resolved attrs from the candidate. For ghost
   * (non-existing) tags, also probe `ghost_links` for a `referenced` flag,
   * the same shape the WikiLink suggestion uses.
   */
  const handleTagSuggestionSelect = useCallback(
    async (item: TagSuggestionItem) => {
      if (!editor || !tagSuggestionState?.range) return;
      const { from, to } = tagSuggestionState.range;
      let referenced = false;
      if (!item.exists) {
        // 既存ページが無いタグでも、別ページで `#name` として登場していれば
        // `referenced=true`（WikiLink ゴーストと同じ判定）。
        // No real page yet, but the tag may already appear on other pages —
        // mirror the WikiLink ghost referenced-check.
        referenced = await checkReferenced(item.name, pageId);
      }
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent([
          {
            type: "text",
            marks: [
              {
                type: "tag",
                attrs: {
                  name: item.name,
                  exists: item.exists,
                  referenced,
                  targetId: item.targetId,
                },
              },
            ],
            text: `#${item.name}`,
          },
        ])
        .run();
      // 確定後はサジェストを必ず閉じ、後続のキーストロークで新規入力規則が
      // 自然に効くようにする。
      // Always close the popover after confirm so subsequent typing flows
      // through the input-rule path normally.
      editor.view.dispatch(editor.view.state.tr.setMeta(tagSuggestionPluginKey, { close: true }));
    },
    [editor, tagSuggestionState, checkReferenced, pageId],
  );

  const handleTagSuggestionClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(editor.view.state.tr.setMeta(tagSuggestionPluginKey, { close: true }));
  }, [editor]);

  return {
    suggestionPos,
    slashPos,
    tagSuggestionPos,
    handleSuggestionSelect,
    handleSuggestionClose,
    handleSlashClose,
    handleTagSuggestionSelect,
    handleTagSuggestionClose,
  };
}
