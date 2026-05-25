import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useWikiLinkCandidates } from "@/hooks/useWikiLinkCandidates";
import { useCheckGhostLinkReferenced, useWikiLinkExistsChecker } from "@/hooks/usePageQueries";
import type {
  SuggestionItem,
  WikiLinkSuggestionHandle,
  WikiLinkSuggestionPage,
} from "./extensions/WikiLinkSuggestion";

/**
 * `useWikiLinkInputBar` のオプション。`WikiLinkInputBar` から関心事
 * （状態保持・退避選択範囲・確定処理）を抜き出してテスタブルに保つための
 * 内部 API。
 *
 * Options for {@link useWikiLinkInputBar}. The hook isolates the bar's
 * stateful concerns (saved selection, async confirm, suggestion plumbing)
 * from rendering so the component itself stays small and the logic is
 * unit-testable.
 */
export interface UseWikiLinkInputBarOptions {
  editor: Editor | null;
  pageId?: string;
  pageNoteId: string | null;
}

/**
 * `useWikiLinkInputBar` の戻り値。`WikiLinkInputBar` が描画と DOM 配線に
 * 必要な値・ハンドラだけを返す（内部 ref は隠す）。
 *
 * Return shape of {@link useWikiLinkInputBar}. Limited to what the
 * rendering component needs — internal refs (saved selection, re-entrancy
 * guard) stay encapsulated inside the hook.
 */
export interface UseWikiLinkInputBarResult {
  value: string;
  setValue: (next: string) => void;
  pages: WikiLinkSuggestionPage[];
  showSuggestions: boolean;
  suggestionRef: React.MutableRefObject<WikiLinkSuggestionHandle | null>;
  handleFocus: () => void;
  handleBlur: () => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleSuggestionSelect: (item: SuggestionItem) => void;
  handleSuggestionClose: () => void;
}

/**
 * 退避するエディタ選択範囲。バーをフォーカスする直前の状態を覚えておき、
 * 確定時にその位置へ Wiki Link を挿入する。
 *
 * Saved editor selection used to insert the link back at the cursor the
 * user left when they jumped into the bar.
 */
interface SavedSelection {
  from: number;
  to: number;
}

/**
 * 入力バーから WikiLink を挿入する共通処理。`existing` 経路は候補側の
 * `targetId` をそのまま使う。`ghost` 経路は `checkExistence` で完全一致を
 * もう一度引いて、当たれば既存リンクへ自動フォールバックする
 * （issue #926 受け入れ条件）。
 *
 * Shared insertion path used by both the standalone-Enter and the
 * suggestion-click flows. The existing branch trusts the resolved
 * `targetId` from the candidate; the ghost branch re-runs `checkExistence`
 * so an exact-match still falls back to the existing link
 * (issue #926 acceptance criterion).
 */
async function buildLinkAttrs(
  trimmed: string,
  forceExists: boolean | null,
  forceTargetId: string | null,
  pageId: string | undefined,
  checkExistence: ReturnType<typeof useWikiLinkExistsChecker>["checkExistence"],
  checkReferenced: ReturnType<typeof useCheckGhostLinkReferenced>["checkReferenced"],
): Promise<{ exists: boolean; referenced: boolean; targetId: string | null }> {
  if (forceExists === true) {
    return { exists: true, referenced: false, targetId: forceTargetId };
  }
  const { pageTitles, referencedTitles, pageTitleToId } = await checkExistence([trimmed], pageId);
  const normalized = trimmed.toLowerCase();
  const exists = pageTitles.has(normalized);
  const targetId = exists ? (pageTitleToId.get(normalized) ?? null) : null;
  let referenced = !exists && referencedTitles.has(normalized);
  if (!exists && !referenced) {
    // `referencedTitles` で拾えなかった ghost も `ghost_links` をもう一度参照
    // して、他ページからの参照があれば `referenced=true` を立てる。
    // Double-check the ghost branch against `ghost_links` to mirror the
    // in-body suggestion flow in `useSuggestionEffects`.
    referenced = await checkReferenced(trimmed, pageId);
  }
  return { exists, referenced, targetId };
}

/**
 * `WikiLinkInputBar` の状態と確定処理を担うフック。レンダリング層から
 * 状態管理を切り出し、`max-lines-per-function` 制約に収めるための分離。
 *
 * State + confirm hook for {@link WikiLinkInputBar}. Splits the stateful
 * core out of the rendering component so the FC stays small enough to
 * satisfy the project's `max-lines-per-function` rule and the logic is
 * unit-testable in isolation.
 */
export function useWikiLinkInputBar({
  editor,
  pageId,
  pageNoteId,
}: UseWikiLinkInputBarOptions): UseWikiLinkInputBarResult {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const savedSelectionRef = useRef<SavedSelection | null>(null);
  const suggestionRef = useRef<WikiLinkSuggestionHandle | null>(null);
  // 確定処理中フラグ。Promise 中に二重 Enter / クリックが入っても 1 回しか
  // 挿入が走らないようにする。
  // Re-entrancy guard so a second Enter or click during the async confirm
  // does not trigger a duplicate insertion.
  const isConfirmingRef = useRef(false);

  const { pages } = useWikiLinkCandidates(pageNoteId);
  // ノートスコープでは `useWikiLinkExistsChecker` が `notePages` 無しに呼ば
  // れると意図的に空の集合を返し、Enter フォールバックが既存ページを解決
  // できずゴーストを挿入してしまう（Codex P1, PR #934）。サジェスト用に
  // 既に取得済みの候補ページを `notePages` としてそのまま流し込み、同じ
  // データソースで完全一致判定できるようにする。`useWikiLinkStatusSync`
  // と同じ流儀。個人スコープでは未指定のまま渡し、checker 側の
  // `repo.getPagesSummary(userId)` 経路を維持する。
  //
  // In note scope `useWikiLinkExistsChecker` returns empty sets when
  // `notePages` is missing, causing the bar's exact-match fallback to
  // never resolve existing note-scope pages and always insert a ghost
  // (Codex P1, PR #934). Reuse the suggestion candidates we already
  // fetched here so the checker has the same data — mirrors
  // `useWikiLinkStatusSync`. Personal scope stays unchanged: the checker
  // ignores `notePages` and falls back to `repo.getPagesSummary(userId)`.
  const { checkExistence } = useWikiLinkExistsChecker({
    pageNoteId,
    notePages: pageNoteId !== null ? pages : undefined,
  });
  const { checkReferenced } = useCheckGhostLinkReferenced();

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (editor) {
      const { from, to } = editor.state.selection;
      savedSelectionRef.current = { from, to };
    }
  }, [editor]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const insertLink = useCallback(
    async (title: string, forceExists: boolean | null, forceTargetId: string | null) => {
      if (!editor) return;
      if (isConfirmingRef.current) return;
      const trimmed = title.trim();
      if (!trimmed) return;

      isConfirmingRef.current = true;
      try {
        const savedFrom = savedSelectionRef.current?.from ?? editor.state.selection.from;
        const { exists, referenced, targetId } = await buildLinkAttrs(
          trimmed,
          forceExists,
          forceTargetId,
          pageId,
          checkExistence,
          checkReferenced,
        );

        editor
          .chain()
          .focus()
          .insertContentAt(savedFrom, [
            {
              type: "text",
              marks: [
                {
                  type: "wikiLink",
                  attrs: { title: trimmed, exists, referenced, targetId },
                },
              ],
              text: `[[${trimmed}]]`,
            },
          ])
          .run();
      } finally {
        isConfirmingRef.current = false;
        setValue("");
        savedSelectionRef.current = null;
      }
    },
    [editor, pageId, checkExistence, checkReferenced],
  );

  const handleSuggestionSelect = useCallback(
    (item: SuggestionItem) => {
      if (item.exists) {
        void insertLink(item.title, true, item.id);
      } else {
        // 「+ 新規作成」エントリ。完全一致の自動フォールバックは
        // `buildLinkAttrs` 側に任せる。
        // Synthetic "+ create" row; let `buildLinkAttrs` re-run the
        // exact-match fallback in case the candidate list is stale.
        void insertLink(item.title, null, null);
      }
    },
    [insertLink],
  );

  const handleSuggestionClose = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Escape は常にバー側で処理する。サジェスト側に渡してしまうと入力値が
      // 残るため、明示的にクリア + エディタへフォーカスを戻す。
      // Always handle Escape at the bar level — delegating to the
      // suggestion would only fire `onClose` and leave the input value
      // behind, which feels broken.
      if (event.key === "Escape") {
        event.preventDefault();
        setValue("");
        savedSelectionRef.current = null;
        editor?.commands.focus();
        return;
      }

      // ↑↓ / Enter はサジェスト UI に委譲する。サジェストが消費した場合は
      // 重複挿入を防ぐためバーの Enter 処理は走らせない。
      // Delegate ArrowUp / ArrowDown / Enter to the shared suggestion
      // handle; skip the bar's Enter fallback when the suggestion already
      // confirmed (avoids a double insertion).
      const handle = suggestionRef.current;
      if (handle) {
        const handled = handle.onKeyDown(event.nativeEvent);
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        void insertLink(trimmed, null, null);
      }
    },
    [editor, insertLink, value],
  );

  // editor が外れたタイミング（読み取り専用切替・unmount 前）で残った状態を
  // 掃除する。保存していた選択範囲は無効なので破棄する。
  // Clean up the saved selection when the editor unmounts or becomes
  // unavailable — the position is no longer valid.
  useEffect(() => {
    if (!editor) {
      savedSelectionRef.current = null;
    }
  }, [editor]);

  return {
    value,
    setValue,
    pages,
    showSuggestions: isFocused && value.trim().length > 0,
    suggestionRef,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleSuggestionSelect,
    handleSuggestionClose,
  };
}
