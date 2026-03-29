import React from "react";
import type { Editor } from "@tiptap/core";
import { cn } from "@zedi/ui";
import {
  Bold,
  Italic,
  Highlighter,
  List,
  ListOrdered,
  CheckSquare,
  Table,
  Palette,
  Strikethrough,
  Code,
  Link2,
  Link2Off,
} from "lucide-react";
import { BubbleMenuButton } from "./BubbleMenuButton";
import { BUBBLE_MENU_PRESET_COLORS } from "./bubbleMenuConfig";
import type { useEditorBubbleMenu } from "./useEditorBubbleMenu";

type EditorBubbleMenuState = ReturnType<typeof useEditorBubbleMenu>;

interface EditorBubbleMenuToolbarProps {
  editor: Editor;
  state: EditorBubbleMenuState;
}

/**
 *
 */
export function EditorBubbleMenuToolbar({ editor, state }: EditorBubbleMenuToolbarProps) {
  /**
   *
   */
  const {
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
    isWikiLinkSelection,
    convertToWikiLink,
    unsetWikiLink,
    isConverting,
  } = state;

  return (
    <div className="shadow-elevated animate-fade-in border-border bg-popover flex items-center gap-0.5 rounded-lg border p-1">
      <BubbleMenuButton
        onClick={toggleBold}
        isActive={editor.isActive("bold")}
        aria-label="太字"
        title="太字 (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={toggleItalic}
        isActive={editor.isActive("italic")}
        aria-label="イタリック"
        title="イタリック (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={toggleStrike}
        isActive={editor.isActive("strike")}
        aria-label="取り消し線"
        title="取り消し線"
      >
        <Strikethrough className="h-4 w-4" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={toggleCode}
        isActive={editor.isActive("code")}
        aria-label="インラインコード"
        title="インラインコード"
      >
        <Code className="h-4 w-4" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={toggleHighlight}
        isActive={editor.isActive("highlight")}
        aria-label="ハイライト"
        title="ハイライト"
      >
        <Highlighter className="h-4 w-4" />
      </BubbleMenuButton>

      {!isWikiLinkSelection ? (
        <BubbleMenuButton
          onClick={convertToWikiLink}
          isActive={false}
          disabled={isConverting}
          aria-label="WikiLinkにする"
          title="WikiLink"
        >
          <Link2 className="h-4 w-4" />
        </BubbleMenuButton>
      ) : (
        <BubbleMenuButton
          onClick={unsetWikiLink}
          isActive={true}
          aria-label="WikiLinkを解除"
          title="WikiLinkを解除"
        >
          <Link2Off className="h-4 w-4" />
        </BubbleMenuButton>
      )}

      <div className="bg-border mx-0.5 h-5 w-px" />

      <BubbleMenuButton
        onClick={toggleBulletList}
        isActive={editor.isActive("bulletList")}
        aria-label="箇条書き"
        title="箇条書き"
      >
        <List className="h-4 w-4" />
      </BubbleMenuButton>

      <BubbleMenuButton
        onClick={toggleOrderedList}
        isActive={editor.isActive("orderedList")}
        aria-label="番号付きリスト"
        title="番号付きリスト"
      >
        <ListOrdered className="h-4 w-4" />
      </BubbleMenuButton>

      {hasTaskList && (
        <BubbleMenuButton
          onClick={toggleTaskList}
          isActive={editor.isActive("taskList")}
          aria-label="タスクリスト"
          title="タスクリスト"
        >
          <CheckSquare className="h-4 w-4" />
        </BubbleMenuButton>
      )}

      <div className="bg-border mx-0.5 h-5 w-px" />

      {hasTable && (
        <BubbleMenuButton
          onClick={insertTable}
          isActive={false}
          aria-label="テーブル"
          title="テーブル挿入"
        >
          <Table className="h-4 w-4" />
        </BubbleMenuButton>
      )}

      <div className="relative">
        <BubbleMenuButton
          onClick={() => setShowColorPicker(!showColorPicker)}
          isActive={showColorPicker}
          aria-label="文字色"
          title="文字色"
        >
          <Palette className="h-4 w-4" />
        </BubbleMenuButton>

        {showColorPicker && (
          <div className="shadow-elevated animate-fade-in border-border bg-popover absolute top-full left-1/2 z-50 mt-1 -translate-x-1/2 rounded-lg border p-2">
            <div className="grid grid-cols-4 gap-1.5">
              {BUBBLE_MENU_PRESET_COLORS.map((color) => (
                <button
                  type="button"
                  key={color.value || "default"}
                  // Keep editor focus so BubbleMenu does not close before setColor runs.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setColor(color.value)}
                  title={color.label}
                  aria-label={color.label}
                  className={cn(
                    "border-border focus:ring-ring h-6 w-6 rounded-md border transition-transform hover:scale-110 focus:ring-2 focus:outline-none",
                    !color.value && "bg-foreground",
                  )}
                  style={color.value ? { backgroundColor: color.value } : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
