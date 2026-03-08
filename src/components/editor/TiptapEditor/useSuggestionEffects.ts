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
import type { SuggestionItem } from "../extensions/WikiLinkSuggestion";
import { useCheckGhostLinkReferenced } from "@/hooks/usePageQueries";

interface UseSuggestionEffectsOptions {
  editor: Editor | null;
  suggestionState: WikiLinkSuggestionState | null;
  slashState: SlashSuggestionState | null;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  pageId: string;
  handleInsertImageClick: () => void;
}

export function useSuggestionEffects({
  editor,
  suggestionState,
  slashState,
  editorContainerRef,
  pageId,
  handleInsertImageClick,
}: UseSuggestionEffectsOptions) {
  const { checkReferenced } = useCheckGhostLinkReferenced();
  const [suggestionPos, setSuggestionPos] = useState<{ top: number; left: number } | null>(null);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);

  // 依存はプリミティブに限定。suggestionState 自体は毎レンダーで新しい参照になるため
  // オブジェクトを依存にすると setState → 再レンダ → effect 再実行の無限ループになる。
  const suggestionActive = suggestionState?.active ?? false;
  const suggestionFrom = suggestionState?.range?.from ?? null;
  const suggestionTo = suggestionState?.range?.to ?? null;

  useEffect(() => {
    if (!editor || !suggestionActive || suggestionFrom === null) {
      queueMicrotask(() => setSuggestionPos(null));
      return;
    }
    const coords = editor.view.coordsAtPos(suggestionFrom);
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

  const slashActive = slashState?.active ?? false;
  const slashFrom = slashState?.range?.from ?? null;
  const slashTo = slashState?.range?.to ?? null;

  useEffect(() => {
    if (!editor || !slashActive || slashFrom === null) {
      queueMicrotask(() => setSlashPos(null));
      return;
    }
    const coords = editor.view.coordsAtPos(slashFrom);
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

  useEffect(() => {
    const handler = () => handleInsertImageClick();
    window.addEventListener("slash-command-insert-image", handler);
    return () => window.removeEventListener("slash-command-insert-image", handler);
  }, [handleInsertImageClick]);

  const handleSuggestionSelect = useCallback(
    async (item: SuggestionItem) => {
      if (!editor || !suggestionState?.range) return;
      const { from, to } = suggestionState.range;
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

  const handleSuggestionClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.view.state.tr.setMeta(wikiLinkSuggestionPluginKey, { close: true }),
    );
  }, [editor]);

  const handleSlashClose = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(editor.view.state.tr.setMeta(slashSuggestionPluginKey, { close: true }));
  }, [editor]);

  return {
    suggestionPos,
    slashPos,
    handleSuggestionSelect,
    handleSuggestionClose,
    handleSlashClose,
  };
}
