import React, { useEffect, useRef, type MutableRefObject } from "react";
import type { Editor } from "@tiptap/core";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { WikiLinkSuggestion } from "./extensions/WikiLinkSuggestion";
import { useWikiLinkInputBar } from "./useWikiLinkInputBar";

/**
 * `WikiLinkInputBar` の props。FAB 左に常時表示されるピル型入力バーを
 * 駆動するために必要な最小限の依存（編集中エディタ、ページ id、所属ノート
 * id）だけを受け取る。マウントは呼び出し側の責務（通常は `TiptapEditor` 内）。
 *
 * Props for the FAB-adjacent WikiLink input bar (#924 §2, #926). Takes only
 * the bare minimum — the active editor, the editing page id, and the owning
 * note id used to scope suggestions. The host (`TiptapEditor`) decides when
 * to mount the bar.
 */
export interface WikiLinkInputBarProps {
  /**
   * 操作対象のエディタ。`null` の間（初期化前）は入力を受け付けない。
   * The editor the bar inserts into. `null` while the editor is being
   * initialized; the bar disables itself in that state.
   */
  editor: Editor | null;
  /** 編集中ページの id。referenced チェック / 自己参照除外のスコープに使う。 / Current page id for the referenced lookups. */
  pageId?: string;
  /**
   * 編集中ページが所属するノート id。`null` は個人ページ、文字列はノート
   * ネイティブページ。`useWikiLinkCandidates` のスコープに直接渡す。
   * Owning note id. Forwarded to `useWikiLinkCandidates` to scope the
   * candidate list (personal vs. same-note). See issue #713 Phase 4.
   */
  pageNoteId: string | null;
  /** 追加でルートに付ける className。 / Optional class name for the outer container. */
  className?: string;
  /**
   * バーの input にフォーカスを移すための imperative ハンドル。`focusContentRef`
   * 等と同じ `MutableRefObject<(() => void) | null>` 規約。`useEditorWikiLinkShortcuts`
   * の `Cmd/Ctrl+K` 経由で外部からフォーカスを移すために使う（issue #928）。
   *
   * Imperative handle for focusing the bar's input. Follows the project's
   * `MutableRefObject<(() => void) | null>` convention (same as
   * `focusContentRef`). Used by `useEditorWikiLinkShortcuts` to focus the
   * bar via `Cmd/Ctrl+K` (issue #928).
   */
  focusInputBarRef?: MutableRefObject<(() => void) | null>;
}

/**
 * FAB 左に常時表示されるピル型入力バー。役割はゴーストリンク作成を主目的と
 * しつつ、入力中に既存ページ候補を提示して既存リンク挿入もできる二役 UI
 * （issue #924 §2 / #926）。フォーカス時にエディタのカーソル位置を退避し、
 * 確定（Enter / 候補クリック）でその位置に Wiki Link を挿入してから
 * エディタへフォーカスを戻す。状態管理は `useWikiLinkInputBar` フックに
 * 委譲する。
 *
 * Pill-shaped input bar mounted next to the FAB. Primary purpose is creating
 * ghost wiki links; typing also shows existing-page suggestions for
 * inserting resolved links. On focus the bar saves the editor cursor so the
 * link lands where the user was writing; on confirm it inserts and returns
 * focus to the editor. Stateful logic lives in {@link useWikiLinkInputBar}.
 * See parent issue #924 §2 and sub-issue #926.
 */
export const WikiLinkInputBar: React.FC<WikiLinkInputBarProps> = ({
  editor,
  pageId,
  pageNoteId,
  className,
  focusInputBarRef,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  // imperative ハンドル: 親（TiptapEditor 経由のショートカットフック）が
  // バーの input にフォーカスを移すための関数を ref に割り当てる。unmount
  // 時に null クリアして dangling reference を残さない。
  // Imperative handle: parent (the shortcut hook wired through TiptapEditor)
  // gets a function to focus the bar's input. Cleared on unmount to avoid
  // dangling references.
  useEffect(() => {
    if (!focusInputBarRef) return;
    focusInputBarRef.current = () => {
      inputRef.current?.focus();
    };
    return () => {
      focusInputBarRef.current = null;
    };
  }, [focusInputBarRef]);

  const {
    value,
    setValue,
    pages,
    showSuggestions,
    suggestionRef,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleSuggestionSelect,
    handleSuggestionClose,
  } = useWikiLinkInputBar({ editor, pageId, pageNoteId });

  return (
    <div
      className={cn("pointer-events-auto flex flex-col items-stretch gap-2", className)}
      data-testid="wiki-link-input-bar"
    >
      {showSuggestions && (
        // mousedown を抑止することで候補クリック時に入力欄が blur せず、
        // クリック→確定の流れがそのまま走るようにする（リスト全体に効く）。
        // input の `onBlur` が先に発火するとリストが unmount され、後続の
        // click イベントが届かない問題を回避する。
        // Prevent the default mousedown action so clicking a candidate does
        // not blur the input — without this the list would unmount on blur
        // and the click event would never reach the candidate row.
        <div className="self-stretch" onMouseDown={(e) => e.preventDefault()}>
          <WikiLinkSuggestion
            ref={suggestionRef}
            query={value}
            pages={pages}
            onSelect={handleSuggestionSelect}
            onClose={handleSuggestionClose}
          />
        </div>
      )}
      <input
        ref={inputRef}
        data-testid="wiki-link-input-bar-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={t("common.wikiLinkInputBar.placeholder")}
        aria-label={t("common.wikiLinkInputBar.ariaLabel")}
        disabled={!editor}
        className={cn(
          "h-12 w-[min(20rem,calc(100vw-7rem))] rounded-full px-5",
          "bg-secondary/80 text-secondary-foreground placeholder:text-muted-foreground",
          "shadow-lg backdrop-blur-sm",
          "border border-transparent",
          "focus:border-ring focus:bg-secondary focus:ring-ring/40 focus:ring-2 focus:outline-none",
          "transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
    </div>
  );
};

export default WikiLinkInputBar;
