import React, { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Button } from "@zedi/ui";
import { Textarea } from "@zedi/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@zedi/ui";
import { Code2, Maximize2, Pencil, Trash2, Check, X } from "lucide-react";
import { wrapArtifactHtml } from "@/lib/htmlArtifact/wrapHtml";

const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 80;

/**
 * HTML アーティファクトの NodeView コンポーネント。
 * sandboxed iframe でインタラクティブ HTML を安全にレンダリングする。
 *
 * NodeView component for HTML artifacts.
 * Renders interactive HTML safely inside a sandboxed iframe.
 */
export const HtmlArtifactNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(DEFAULT_HEIGHT);

  const content = node.attrs.content as string;
  const title = (node.attrs.title as string) || "";
  const wrappedHtml = content ? wrapArtifactHtml(content) : "";
  const isEditable = editor.isEditable;

  const handleMessage = useCallback((event: MessageEvent) => {
    if (
      event.data &&
      typeof event.data === "object" &&
      event.data.type === "zedi-artifact-resize" &&
      typeof event.data.height === "number"
    ) {
      const newHeight = Math.max(MIN_HEIGHT, event.data.height + 32);
      setIframeHeight(newHeight);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const handleStartEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleSave = () => {
    updateAttributes({ content: editContent });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent("");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <NodeViewWrapper className="html-artifact-node" data-type="html-artifact">
        <div className="bg-muted/30 rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-muted-foreground text-sm font-medium">
              HTML アーティファクトを編集
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleSave}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            placeholder="<div>Hello World</div>"
          />
        </div>
      </NodeViewWrapper>
    );
  }

  if (!content) {
    return (
      <NodeViewWrapper className="html-artifact-node" data-type="html-artifact">
        <div className="text-muted-foreground flex h-32 items-center justify-center rounded-lg border border-dashed">
          <span className="text-sm">HTML アーティファクトが空です</span>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="html-artifact-node" data-type="html-artifact">
      <div
        className={`group relative rounded-lg border bg-white dark:bg-gray-900 ${
          selected ? "ring-primary ring-2" : ""
        }`}
      >
        {/* ヘッダー */}
        {title && (
          <div className="text-muted-foreground flex items-center gap-2 border-b px-3 py-1.5 text-xs">
            <Code2 className="h-3.5 w-3.5" />
            <span>{title}</span>
          </div>
        )}

        {/* ツールバー */}
        {isEditable && (
          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsFullscreen(true)}
              title="拡大表示"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleStartEdit} title="編集">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={deleteNode}
              title="削除"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* iframe レンダリング */}
        <div className="overflow-hidden rounded-b-lg">
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts"
            srcDoc={wrappedHtml}
            title={title || "HTML Artifact"}
            className="w-full border-0"
            style={{ height: `${iframeHeight}px` }}
          />
        </div>

        {/* フルスクリーンダイアログ */}
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-auto p-0">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>{title || "HTML Artifact"}</DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-4">
              <iframe
                ref={fullscreenIframeRef}
                sandbox="allow-scripts"
                srcDoc={wrappedHtml}
                title={title || "HTML Artifact"}
                className="w-full border-0"
                style={{ height: "70vh" }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </NodeViewWrapper>
  );
};
