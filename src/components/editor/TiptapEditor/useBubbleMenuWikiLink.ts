import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useWikiLinkExistsChecker } from "@/hooks/usePageQueries";

export interface UseBubbleMenuWikiLinkOptions {
  editor: Editor;
  pageId?: string;
}

export function useBubbleMenuWikiLink({ editor, pageId }: UseBubbleMenuWikiLinkOptions) {
  const { checkExistence } = useWikiLinkExistsChecker();
  const [isConverting, setIsConverting] = useState(false);

  const isWikiLinkSelection = editor.isActive("wikiLink");

  const convertToWikiLink = useCallback(async () => {
    if (isConverting) return;

    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, null, "\ufffc").trim();
    if (!text) return;

    setIsConverting(true);
    try {
      let exists = false;
      let referenced = false;
      if (pageId !== undefined) {
        const { pageTitles, referencedTitles } = await checkExistence([text], pageId);
        const normalized = text.toLowerCase().trim();
        exists = pageTitles.has(normalized);
        referenced = referencedTitles.has(normalized);
      }

      const { from: currentFrom, to: currentTo } = editor.state.selection;
      const currentText = editor.state.doc
        .textBetween(currentFrom, currentTo, null, "\ufffc")
        .trim();
      if (currentText !== text) return;

      editor
        .chain()
        .focus()
        .deleteRange({ from: currentFrom, to: currentTo })
        .insertContent([
          {
            type: "text",
            marks: [
              {
                type: "wikiLink",
                attrs: { title: text, exists, referenced },
              },
            ],
            text: `[[${text}]]`,
          },
        ])
        .run();
    } finally {
      setIsConverting(false);
    }
  }, [editor, pageId, checkExistence, isConverting]);

  const unsetWikiLink = useCallback(() => {
    editor.chain().focus().unsetWikiLink().run();
  }, [editor]);

  return { isWikiLinkSelection, convertToWikiLink, unsetWikiLink, isConverting };
}
