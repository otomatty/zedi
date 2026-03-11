import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useBubbleMenuWikiLink } from "./useBubbleMenuWikiLink";

export function useEditorBubbleMenu(editor: Editor, pageId?: string) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const wikiLink = useBubbleMenuWikiLink({ editor, pageId });

  const toggleBold = useCallback(() => {
    editor.chain().focus().toggleBold().run();
  }, [editor]);

  const toggleItalic = useCallback(() => {
    editor.chain().focus().toggleItalic().run();
  }, [editor]);

  const toggleStrike = useCallback(() => {
    editor.chain().focus().toggleStrike().run();
  }, [editor]);

  const toggleCode = useCallback(() => {
    editor.chain().focus().toggleCode().run();
  }, [editor]);

  const toggleHighlight = useCallback(() => {
    editor.chain().focus().toggleHighlight().run();
  }, [editor]);

  const toggleBulletList = useCallback(() => {
    editor.chain().focus().toggleBulletList().run();
  }, [editor]);

  const toggleOrderedList = useCallback(() => {
    editor.chain().focus().toggleOrderedList().run();
  }, [editor]);

  const toggleTaskList = useCallback(() => {
    editor.chain().focus().toggleTaskList().run();
  }, [editor]);

  const insertTable = useCallback(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  const setColor = useCallback(
    (color: string) => {
      if (!color) {
        editor.chain().focus().unsetColor().run();
      } else {
        editor.chain().focus().setColor(color).run();
      }
      setShowColorPicker(false);
    },
    [editor],
  );

  const hasTable = !!editor.extensionManager.extensions.find((e) => e.name === "table");
  const hasTaskList = !!editor.extensionManager.extensions.find((e) => e.name === "taskList");

  return {
    showColorPicker,
    setShowColorPicker,
    setColor,
    hasTable,
    hasTaskList,
    toggleBold,
    toggleItalic,
    toggleStrike,
    toggleCode,
    toggleHighlight,
    toggleBulletList,
    toggleOrderedList,
    toggleTaskList,
    insertTable,
    ...wikiLink,
  };
}
