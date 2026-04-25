import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useWikiLinkExistsChecker } from "@/hooks/usePageQueries";

/**
 * `useBubbleMenuWikiLink` のオプション。バブルメニューから WikiLink への
 * 変換を行うエディタと、解決スコープ判定に使う現在のページ id を受け取る。
 *
 * Options for {@link useBubbleMenuWikiLink}. Provides the editor that will
 * receive the WikiLink conversion and the current page id used to scope
 * existence checks (and to exclude self-references).
 */
export interface UseBubbleMenuWikiLinkOptions {
  editor: Editor;
  pageId?: string;
}

/**
 * `useBubbleMenuWikiLink` の戻り値。バブルメニューが必要とする状態と
 * コマンドを公開契約として固定する（CodeRabbit レビュー指摘 / 戦略的
 * `any` 禁止に従い、戻り値の型を明示）。
 *
 * Return shape of {@link useBubbleMenuWikiLink}. Fixes the public contract
 * so downstream consumers stay stable as the payload evolves (per CodeRabbit
 * review and the project's "no inferred public types" rule).
 */
export interface UseBubbleMenuWikiLinkResult {
  /** True while the current selection sits inside a `wikiLink` mark. */
  isWikiLinkSelection: boolean;
  /** Convert the current selection text into a `[[Title]]` WikiLink mark. */
  convertToWikiLink: () => Promise<void>;
  /** Remove the `wikiLink` mark from the current selection. */
  unsetWikiLink: () => void;
  /** True while {@link UseBubbleMenuWikiLinkResult.convertToWikiLink} is running. */
  isConverting: boolean;
}

/**
 * バブルメニューの「WikiLink に変換」操作を提供するフック。選択中テキストを
 * `[[Title]]` マークに変換し、解決済みのターゲットページがあれば `targetId`
 * 属性も埋める（issue #737）。
 *
 * Hook providing the bubble-menu "convert to WikiLink" action. Wraps the
 * selection in a `[[Title]]` mark and, when the title resolves to an
 * existing page, populates the `targetId` attribute (issue #737) so future
 * rename propagation can disambiguate same-title pages by id.
 */
export function useBubbleMenuWikiLink({
  editor,
  pageId,
}: UseBubbleMenuWikiLinkOptions): UseBubbleMenuWikiLinkResult {
  const { checkExistence } = useWikiLinkExistsChecker();
  const [isConverting, setIsConverting] = useState(false);
  const convertingRef = useRef(false);

  const isWikiLinkSelection = editor.isActive("wikiLink");

  const convertToWikiLink = useCallback(async () => {
    if (convertingRef.current) return;

    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, null, "￼").trim();
    if (!text) return;

    convertingRef.current = true;
    setIsConverting(true);
    try {
      let exists = false;
      let referenced = false;
      let targetId: string | null = null;
      if (pageId !== undefined) {
        const { pageTitles, referencedTitles, pageTitleToId } = await checkExistence(
          [text],
          pageId,
        );
        const normalized = text.toLowerCase().trim();
        exists = pageTitles.has(normalized);
        referenced = referencedTitles.has(normalized);
        // 解決済みターゲット ID を埋めることで、後続のリネーム伝播が同名ページとの
        // 衝突を ID 一致で回避できる（issue #737）。未解決時は `null` のまま残し、
        // 旧データと同様にタイトル一致 fallback を許す。
        // Populate the resolved target id so future rename propagation can
        // disambiguate same-title pages by id (issue #737). Leaving it null
        // preserves the legacy title-only fallback path for unresolved marks.
        targetId = pageTitleToId.get(normalized) ?? null;
      }

      const { from: currentFrom, to: currentTo } = editor.state.selection;
      const currentText = editor.state.doc.textBetween(currentFrom, currentTo, null, "￼").trim();
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

  const unsetWikiLink = useCallback(() => {
    editor.chain().focus().unsetWikiLink().run();
  }, [editor]);

  return { isWikiLinkSelection, convertToWikiLink, unsetWikiLink, isConverting };
}
