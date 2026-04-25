import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useWikiLinkExistsChecker } from "@/hooks/usePageQueries";

/**
 *
 */
export interface UseBubbleMenuWikiLinkOptions {
  editor: Editor;
  pageId?: string;
}

/**
 *
 */
export function useBubbleMenuWikiLink({ editor, pageId }: UseBubbleMenuWikiLinkOptions) {
  /**
   *
   */
  const { checkExistence } = useWikiLinkExistsChecker();
  /**
   *
   */
  const [isConverting, setIsConverting] = useState(false);
  /**
   *
   */
  const convertingRef = useRef(false);

  /**
   *
   */
  const isWikiLinkSelection = editor.isActive("wikiLink");

  /**
   *
   */
  const convertToWikiLink = useCallback(async () => {
    if (convertingRef.current) return;

    /**
     *
     */
    const { from, to } = editor.state.selection;
    /**
     *
     */
    const text = editor.state.doc.textBetween(from, to, null, "\ufffc").trim();
    if (!text) return;

    convertingRef.current = true;
    setIsConverting(true);
    try {
      /**
       *
       */
      let exists = false;
      /**
       *
       */
      let referenced = false;
      /**
       *
       */
      let targetId: string | null = null;
      if (pageId !== undefined) {
        /**
         *
         */
        const { pageTitles, referencedTitles, pageTitleToId } = await checkExistence(
          [text],
          pageId,
        );
        /**
         *
         */
        const normalized = text.toLowerCase().trim();
        exists = pageTitles.has(normalized);
        referenced = referencedTitles.has(normalized);
        // \u89e3\u6c7a\u6e08\u307f\u30bf\u30fc\u30b2\u30c3\u30c8 ID \u3092\u57cb\u3081\u308b\u3053\u3068\u3067\u3001\u5f8c\u7d9a\u306e\u30ea\u30cd\u30fc\u30e0\u4f1d\u64ad\u304c\u540c\u540d\u30da\u30fc\u30b8\u3068\u306e
        // \u885d\u7a81\u3092 ID \u4e00\u81f4\u3067\u56de\u907f\u3067\u304d\u308b\uff08issue #737\uff09\u3002\u672a\u89e3\u6c7a\u6642\u306f `null` \u306e\u307e\u307e\u6b8b\u3057\u3001
        // \u65e7\u30c7\u30fc\u30bf\u3068\u540c\u69d8\u306b\u30bf\u30a4\u30c8\u30eb\u4e00\u81f4 fallback \u3092\u8a31\u3059\u3002
        // Populate the resolved target id so future rename propagation can
        // disambiguate same-title pages by id (issue #737). Leaving it null
        // preserves the legacy title-only fallback path for unresolved marks.
        targetId = pageTitleToId.get(normalized) ?? null;
      }

      /**
       *
       */
      const { from: currentFrom, to: currentTo } = editor.state.selection;
      /**
       *
       */
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
                attrs: { title: text, exists, referenced, targetId },
              },
            ],
            text: `[[${text}]]`,
          },
        ])
        .run();
    } finally {
      convertingRef.current = false;
      setIsConverting(false);
    }
  }, [editor, pageId, checkExistence]);

  /**
   *
   */
  const unsetWikiLink = useCallback(() => {
    editor.chain().focus().unsetWikiLink().run();
  }, [editor]);

  return { isWikiLinkSelection, convertToWikiLink, unsetWikiLink, isConverting };
}
