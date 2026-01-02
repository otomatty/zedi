import { useState, useCallback } from "react";
import { Editor } from "@tiptap/react";

interface UseEditorSelectionMenuReturn {
  showMenu: boolean;
  menuPosition: { top: number; left: number } | null;
  selectedText: string;
  handleOpenMermaidDialog: () => void;
  handleSelectionUpdate: (props: { editor: Editor }) => void;
}

interface UseEditorSelectionMenuOptions {
  containerRef: React.RefObject<HTMLDivElement>;
  onOpenMermaidDialog?: (selectedText: string) => void;
}

/**
 * Hook to handle editor selection menu
 * Shows a floating menu when text is selected (10+ characters)
 */
export function useEditorSelectionMenu({
  containerRef,
  onOpenMermaidDialog,
}: UseEditorSelectionMenuOptions): UseEditorSelectionMenuReturn {
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [selectionMenuPos, setSelectionMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [selectedText, setSelectedText] = useState("");

  // Handle selection update - to be used in editor's onSelectionUpdate prop
  const handleSelectionUpdate = useCallback(
    ({ editor }: { editor: Editor }) => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;
      const text = editor.state.doc.textBetween(from, to, " ");

      // 10文字以上の選択時にメニューを表示
      if (hasSelection && text.trim().length >= 10) {
        const coords = editor.view.coordsAtPos(from);
        const containerRect = containerRef.current?.getBoundingClientRect();

        if (containerRect) {
          setSelectionMenuPos({
            top: coords.top - containerRect.top - 40,
            left: coords.left - containerRect.left,
          });
          setSelectedText(text);
          setShowSelectionMenu(true);
        }
      } else {
        setShowSelectionMenu(false);
      }
    },
    [containerRef]
  );

  const handleOpenMermaidDialog = useCallback(() => {
    if (selectedText.trim()) {
      onOpenMermaidDialog?.(selectedText);
    }
  }, [selectedText, onOpenMermaidDialog]);

  return {
    showMenu: showSelectionMenu,
    menuPosition: selectionMenuPos,
    selectedText,
    handleOpenMermaidDialog,
    handleSelectionUpdate,
  };
}
