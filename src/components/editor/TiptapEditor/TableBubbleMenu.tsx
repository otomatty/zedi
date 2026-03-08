import React from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { cn } from "@zedi/ui";
import {
  ArrowUpFromLine,
  ArrowDownFromLine,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Trash2,
  Rows3,
  Columns3,
  TableProperties,
} from "lucide-react";

interface TableBubbleMenuProps {
  editor: Editor;
}

export const TableBubbleMenu: React.FC<TableBubbleMenuProps> = ({ editor }) => {
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top" }}
      shouldShow={({ editor }) => {
        return editor.isActive("table");
      }}
    >
      <div className="shadow-elevated flex animate-fade-in items-center gap-0.5 rounded-lg border border-border bg-popover p-1">
        {/* Add row before */}
        <TableButton
          onClick={() => editor.chain().focus().addRowBefore().run()}
          aria-label="上に行を追加"
          title="上に行を追加"
        >
          <ArrowUpFromLine className="h-3.5 w-3.5" />
        </TableButton>

        {/* Add row after */}
        <TableButton
          onClick={() => editor.chain().focus().addRowAfter().run()}
          aria-label="下に行を追加"
          title="下に行を追加"
        >
          <ArrowDownFromLine className="h-3.5 w-3.5" />
        </TableButton>

        {/* Delete row */}
        <TableButton
          onClick={() => editor.chain().focus().deleteRow().run()}
          aria-label="行を削除"
          title="行を削除"
          variant="destructive"
        >
          <Rows3 className="h-3.5 w-3.5" />
        </TableButton>

        <div className="mx-0.5 h-5 w-px bg-border" />

        {/* Add column before */}
        <TableButton
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          aria-label="左に列を追加"
          title="左に列を追加"
        >
          <ArrowLeftFromLine className="h-3.5 w-3.5" />
        </TableButton>

        {/* Add column after */}
        <TableButton
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          aria-label="右に列を追加"
          title="右に列を追加"
        >
          <ArrowRightFromLine className="h-3.5 w-3.5" />
        </TableButton>

        {/* Delete column */}
        <TableButton
          onClick={() => editor.chain().focus().deleteColumn().run()}
          aria-label="列を削除"
          title="列を削除"
          variant="destructive"
        >
          <Columns3 className="h-3.5 w-3.5" />
        </TableButton>

        <div className="mx-0.5 h-5 w-px bg-border" />

        {/* Toggle header row */}
        <TableButton
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          aria-label="ヘッダー行を切り替え"
          title="ヘッダー行を切り替え"
        >
          <TableProperties className="h-3.5 w-3.5" />
        </TableButton>

        {/* Delete table */}
        <TableButton
          onClick={() => editor.chain().focus().deleteTable().run()}
          aria-label="テーブルを削除"
          title="テーブルを削除"
          variant="destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </TableButton>
      </div>
    </BubbleMenu>
  );
};

function TableButton({
  onClick,
  children,
  variant,
  ...props
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "destructive";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        variant === "destructive"
          ? "text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
