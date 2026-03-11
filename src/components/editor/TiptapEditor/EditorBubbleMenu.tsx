import React from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { EditorBubbleMenuToolbar } from "./EditorBubbleMenuToolbar";
import { useEditorBubbleMenu } from "./useEditorBubbleMenu";

interface EditorBubbleMenuProps {
  editor: Editor;
  /** 現在のページID。WikiLink 作成時の referenced 判定に使用（任意） */
  pageId?: string;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({ editor, pageId }) => {
  const state = useEditorBubbleMenu(editor, pageId);

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top" }}
      shouldShow={({ editor, state: menuState }) => {
        if (menuState.selection.empty && !editor.isActive("wikiLink")) return false;
        if (editor.isActive("codeBlock")) return false;
        return true;
      }}
    >
      <EditorBubbleMenuToolbar editor={editor} state={state} />
    </BubbleMenu>
  );
};
