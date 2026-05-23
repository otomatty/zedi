import React, { useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { Bold, Italic, Strikethrough, Code, Link2, Link2Off } from "lucide-react";
import { useVirtualKeyboardOffset } from "@/hooks/useVirtualKeyboardOffset";
import { BubbleMenuButton } from "./BubbleMenuButton";
import { useBubbleMenuWikiLink } from "./useBubbleMenuWikiLink";
import { useMobileSelectionVisible } from "./useMobileSelectionVisible";

/**
 * `MobileSelectionSheet` の props。モバイルで本文を選択中のとき、画面下端
 * （キーボードがあればその直上）にシートを表示するために、操作対象の
 * エディタと現在のページ id を受け取る。`pageId` は WikiLink 変換時の
 * `referenced` 判定 / 自己参照除外に使う。
 *
 * Props for {@link MobileSelectionSheet}. The host (`TiptapEditor`) mounts
 * the sheet only on mobile and passes the editor plus the editing page id.
 * `pageId` is forwarded to the wiki-link converter so the resulting mark
 * carries the correct `referenced` flag and skips self-references.
 */
export interface MobileSelectionSheetProps {
  /** 操作対象のエディタ。`null` の間は何も描画しない。 / Target editor; renders nothing while `null`. */
  editor: Editor | null;
  /** 現在のページ id。WikiLink 変換時の参照スコープに使う。 / Current page id used by the wiki-link converter. */
  pageId?: string;
}

/**
 * モバイルで本文を選択中のとき、キーボード直上に固定表示するシート。
 * デスクトップの `EditorBubbleMenu` は仮想キーボードと干渉するため
 * モバイルでは非表示にし、その代替としてこのシートを表示する
 * （issue #924 §2 / #929）。
 *
 * 表示条件は `EditorBubbleMenu` の `shouldShow` と同一で、選択が空で
 * かつ `wikiLink` マーク外、または `codeBlock` 内、または編集不可・
 * 非フォーカスの場合は描画しない（`useMobileSelectionVisible` に委譲）。
 *
 * 仮想キーボードの追従は `useVirtualKeyboardOffset` を使い、シートが
 * 表示されている間だけ `visualViewport` のリスナーを登録する
 * （issue #927 と同じ仕組み）。
 *
 * 提供アクション（最小セット）: Wiki Link 化（または解除）/ Bold /
 * Italic / Code / Strike。最終的なボタン一覧は要望に応じて段階的に
 * 拡張する想定。
 *
 * Sheet pinned to the bottom edge (and tracking the virtual keyboard via
 * `visualViewport`) that replaces the desktop bubble menu on mobile. The
 * bubble menu collides with the on-screen keyboard on phones, so it is
 * hidden on mobile and this sheet takes over for the same set of editing
 * actions (issue #924 §2 / #929). Visibility mirrors the bubble menu's
 * `shouldShow` predicate (see `useMobileSelectionVisible`). Initial action
 * set per the issue: convert/unset wiki link plus Bold / Italic / Code /
 * Strike — additional toolbar items can be folded in as the UX evolves.
 */
export const MobileSelectionSheet: React.FC<MobileSelectionSheetProps> = ({ editor, pageId }) => {
  const visible = useMobileSelectionVisible(editor);
  const keyboardOffset = useVirtualKeyboardOffset(visible);
  const { isWikiLinkSelection, convertToWikiLink, unsetWikiLink, isConverting } =
    useBubbleMenuWikiLink({ editor, pageId });

  const toggleBold = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleBold().run();
  }, [editor]);

  const toggleItalic = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleItalic().run();
  }, [editor]);

  const toggleStrike = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleStrike().run();
  }, [editor]);

  const toggleCode = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleCode().run();
  }, [editor]);

  if (!editor || !visible) return null;

  // キーボードが出ているときは safe-area 余白は不要（キーボードが既に
  // その領域を占有しているため）。0.25rem だけ視覚的なすき間を確保。
  // When the keyboard is up, the safe-area padding is hidden behind the
  // keyboard anyway; collapse it to a small gap to keep the sheet pinned
  // to the keyboard's top edge.
  const isKeyboardOpen = keyboardOffset > 0;
  const bottomStyle = isKeyboardOpen ? `${keyboardOffset}px` : undefined;
  const paddingBottomStyle = isKeyboardOpen
    ? "0.25rem"
    : "calc(env(safe-area-inset-bottom) + var(--app-bottom-nav-height, 0px) + 0.25rem)";

  return (
    <div
      data-testid="mobile-selection-sheet"
      role="toolbar"
      aria-label="モバイル選択シート"
      className="border-border bg-popover fixed inset-x-0 z-40 flex items-center justify-center gap-1 border-t px-2 pt-1 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
      style={{
        bottom: bottomStyle,
        paddingBottom: paddingBottomStyle,
      }}
    >
      <BubbleMenuButton
        onClick={toggleBold}
        isActive={editor.isActive("bold")}
        aria-label="Bold"
        title="Bold"
      >
        <Bold className="h-5 w-5" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={toggleItalic}
        isActive={editor.isActive("italic")}
        aria-label="Italic"
        title="Italic"
      >
        <Italic className="h-5 w-5" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={toggleStrike}
        isActive={editor.isActive("strike")}
        aria-label="Strike"
        title="Strike"
      >
        <Strikethrough className="h-5 w-5" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={toggleCode}
        isActive={editor.isActive("code")}
        aria-label="Code"
        title="Inline code"
      >
        <Code className="h-5 w-5" />
      </BubbleMenuButton>

      <div className="bg-border mx-1 h-5 w-px" />

      {isWikiLinkSelection ? (
        <BubbleMenuButton
          onClick={unsetWikiLink}
          isActive
          aria-label="Unset Wiki Link"
          title="Unset Wiki Link"
        >
          <Link2Off className="h-5 w-5" />
        </BubbleMenuButton>
      ) : (
        <BubbleMenuButton
          onClick={convertToWikiLink}
          isActive={false}
          disabled={isConverting}
          aria-label="Wiki Link"
          title="Convert to Wiki Link"
        >
          <Link2 className="h-5 w-5" />
        </BubbleMenuButton>
      )}
    </div>
  );
};

export default MobileSelectionSheet;
