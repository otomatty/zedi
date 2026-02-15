import React, { useCallback, useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

/** Preset text colors for the color picker */
const PRESET_COLORS = [
  { label: "デフォルト", value: "" },
  { label: "グレー", value: "#6b7280" },
  { label: "赤", value: "#dc2626" },
  { label: "オレンジ", value: "#ea580c" },
  { label: "緑", value: "#16a34a" },
  { label: "青", value: "#2563eb" },
  { label: "紫", value: "#7c3aed" },
  { label: "ピンク", value: "#db2777" },
];

interface EditorBubbleMenuProps {
  editor: Editor;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({
  editor,
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);

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
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
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
    [editor]
  );

  const hasTable = !!editor.extensionManager.extensions.find(
    (e) => e.name === "table"
  );
  const hasTaskList = !!editor.extensionManager.extensions.find(
    (e) => e.name === "taskList"
  );

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top" }}
      shouldShow={({ editor, state }) => {
        // Don't show on empty selections
        if (state.selection.empty) return false;
        // Don't show inside code blocks
        if (editor.isActive("codeBlock")) return false;
        return true;
      }}
    >
      <div className="flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-elevated p-1 animate-fade-in">
        {/* Bold */}
        <BubbleButton
          onClick={toggleBold}
          isActive={editor.isActive("bold")}
          aria-label="太字"
          title="太字 (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </BubbleButton>

        {/* Italic */}
        <BubbleButton
          onClick={toggleItalic}
          isActive={editor.isActive("italic")}
          aria-label="イタリック"
          title="イタリック (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </BubbleButton>

        {/* Strikethrough */}
        <BubbleButton
          onClick={toggleStrike}
          isActive={editor.isActive("strike")}
          aria-label="取り消し線"
          title="取り消し線"
        >
          <Strikethrough className="h-4 w-4" />
        </BubbleButton>

        {/* Code */}
        <BubbleButton
          onClick={toggleCode}
          isActive={editor.isActive("code")}
          aria-label="インラインコード"
          title="インラインコード"
        >
          <Code className="h-4 w-4" />
        </BubbleButton>

        {/* Highlight */}
        <BubbleButton
          onClick={toggleHighlight}
          isActive={editor.isActive("highlight")}
          aria-label="ハイライト"
          title="ハイライト"
        >
          <Highlighter className="h-4 w-4" />
        </BubbleButton>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Bullet List */}
        <BubbleButton
          onClick={toggleBulletList}
          isActive={editor.isActive("bulletList")}
          aria-label="箇条書き"
          title="箇条書き"
        >
          <List className="h-4 w-4" />
        </BubbleButton>

        {/* Ordered List */}
        <BubbleButton
          onClick={toggleOrderedList}
          isActive={editor.isActive("orderedList")}
          aria-label="番号付きリスト"
          title="番号付きリスト"
        >
          <ListOrdered className="h-4 w-4" />
        </BubbleButton>

        {/* Task List */}
        {hasTaskList && (
          <BubbleButton
            onClick={toggleTaskList}
            isActive={editor.isActive("taskList")}
            aria-label="タスクリスト"
            title="タスクリスト"
          >
            <CheckSquare className="h-4 w-4" />
          </BubbleButton>
        )}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Table insert */}
        {hasTable && (
          <BubbleButton
            onClick={insertTable}
            isActive={false}
            aria-label="テーブル"
            title="テーブル挿入"
          >
            <Table className="h-4 w-4" />
          </BubbleButton>
        )}

        {/* Color picker */}
        <div className="relative">
          <BubbleButton
            onClick={() => setShowColorPicker(!showColorPicker)}
            isActive={showColorPicker}
            aria-label="文字色"
            title="文字色"
          >
            <Palette className="h-4 w-4" />
          </BubbleButton>

          {showColorPicker && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-popover border border-border rounded-lg shadow-elevated p-2 z-50 animate-fade-in">
              <div className="grid grid-cols-4 gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.value || "default"}
                    onClick={() => setColor(color.value)}
                    title={color.label}
                    className={cn(
                      "w-6 h-6 rounded-md border border-border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring",
                      !color.value && "bg-foreground"
                    )}
                    style={color.value ? { backgroundColor: color.value } : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </BubbleMenu>
  );
};

/** Small toolbar button for the bubble menu */
function BubbleButton({
  onClick,
  isActive,
  children,
  ...props
}: {
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-md transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      {...props}
    >
      {children}
    </button>
  );
}
