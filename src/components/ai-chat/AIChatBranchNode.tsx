import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch, MessageSquare, Sparkles, Trash2, User } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cn,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { BranchNode } from "../../lib/messageTreeLayout";

/**
 * Custom React Flow node for branch tree (user/assistant messages + context menu).
 * ブランチツリー用カスタムノード（ユーザー／アシスタント＋コンテキストメニュー）。
 */
export function AIChatBranchNode({ data }: NodeProps<BranchNode>) {
  const { t } = useTranslation();
  const isUser = data.role === "user";
  const isOnActivePath = data.isOnActivePath;
  const isActiveLeaf = data.isActiveLeaf;

  const bubble = (
    <>
      <Handle type="target" position={Position.Top} className="!bg-muted !h-2 !w-2 border-2" />
      <div
        className={cn(
          "flex max-w-[200px] min-w-[160px] items-center gap-2 rounded-lg px-3 py-2 text-xs shadow-md",
          "border-2 transition-opacity",
          isUser
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-foreground border-muted-foreground/30",
          isOnActivePath ? "ring-primary/50 opacity-100 ring-2" : "opacity-50",
          isActiveLeaf && "ring-primary ring-offset-background ring-2 ring-offset-2",
        )}
      >
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            isUser ? "bg-primary-foreground/20" : "bg-muted-foreground/20",
          )}
        >
          {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
        </div>
        <span className="line-clamp-2 flex-1 break-words" title={data.contentPreview}>
          {data.contentPreview || (isUser ? "User" : "Assistant")}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted !h-2 !w-2 border-2" />
    </>
  );

  const hasMenu =
    data.onGoToBranch != null || data.onBranchFrom != null || data.onRequestDelete != null;

  if (!hasMenu) {
    return <div className="flex flex-col items-center">{bubble}</div>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex flex-col items-center">{bubble}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        {data.onGoToBranch != null && (
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              data.onGoToBranch?.();
            }}
          >
            <MessageSquare className="mr-2 h-3.5 w-3.5" />
            {t("aiChat.branchTree.goToBranch")}
          </ContextMenuItem>
        )}
        {data.onBranchFrom != null && (
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              data.onBranchFrom?.();
            }}
          >
            <GitBranch className="mr-2 h-3.5 w-3.5" />
            {t("aiChat.branchTree.branchFromHere")}
          </ContextMenuItem>
        )}
        {data.onRequestDelete != null && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={data.isRoot === true}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onSelect={(e) => {
                e.preventDefault();
                if (!data.isRoot) data.onRequestDelete?.();
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {t("aiChat.branchTree.deleteBranch")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
