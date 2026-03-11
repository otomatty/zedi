import { useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { useCheckGhostLinkReferenced } from "@/hooks/usePageQueries";

export interface UseBubbleMenuWikiLinkOptions {
  editor: Editor;
  pageId?: string;
}

export function useBubbleMenuWikiLink({ editor, pageId }: UseBubbleMenuWikiLinkOptions) {
  const { checkReferenced } = useCheckGhostLinkReferenced();

  const isWikiLinkSelection = editor.isActive("wikiLink");

  const convertToWikiLink = useCallback(async () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, null, "\ufffc").trim();
    if (!text) return;
    let referenced = false;
    if (pageId) {
      referenced = await checkReferenced(text, pageId);
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
              attrs: { title: text, exists: false, referenced },
            },
          ],
          text: `[[${text}]]`,
        },
      ])
      .run();
  }, [editor, pageId, checkReferenced]);

  const unsetWikiLink = useCallback(() => {
    editor.chain().focus().unsetWikiLink().run();
  }, [editor]);

  return { isWikiLinkSelection, convertToWikiLink, unsetWikiLink };
}
