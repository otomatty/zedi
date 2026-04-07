import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Button } from "@zedi/ui";
import { Textarea } from "@zedi/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@zedi/ui";
import { Code2, Maximize2, Pencil, Trash2, Check, X } from "lucide-react";
import { wrapArtifactHtml } from "@/lib/htmlArtifact/wrapHtml";

const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 80;
/** Upper bound for iframe height from postMessage (avoids layout blow-ups). / postMessage 由来の iframe 高さの上限（レイアウト破綻を防ぐ）。 */
const MAX_HEIGHT = 4000;

/**
 * HTML アーティファクトの NodeView コンポーネント。
 * sandboxed iframe でインタラクティブ HTML を安全にレンダリングする。
 *
 * NodeView component for HTML artifacts.
 * Renders interactive HTML safely inside a sandboxed iframe.
 */
// eslint-disable-next-line max-lines-per-function -- TipTap NodeView: postMessage resize, iframe, fullscreen dialog, i18n, and a11y in one place.
export const HtmlArtifactNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}) => {
  const { t } = useTranslation();
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
  const iframeTitle = title || t("editor.htmlArtifact.iframeTitle");

  const handleMessage = useCallback((event: MessageEvent) => {
    const inlineWin = iframeRef.current?.contentWindow;
    const fullscreenWin = fullscreenIframeRef.current?.contentWindow;
    if (
      (event.source !== inlineWin && event.source !== fullscreenWin) ||
      !event.data ||
      typeof event.data !== "object" ||
      event.data.type !== "zedi-artifact-resize" ||
      typeof event.data.height !== "number" ||
      !Number.isFinite(event.data.height)
    ) {
      return;
    }
    const padded = Math.round(event.data.height + 32);
    const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, padded));
    setIframeHeight(newHeight);
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
              {t("editor.htmlArtifact.editHeading")}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                type="button"
                aria-label={t("editor.htmlArtifact.cancel")}
                title={t("editor.htmlArtifact.cancel")}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSave}
                type="button"
                aria-label={t("editor.htmlArtifact.save")}
                title={t("editor.htmlArtifact.save")}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            placeholder={t("editor.htmlArtifact.placeholder")}
          />
        </div>
      </NodeViewWrapper>
    );
  }

  if (!content) {
    return (
      <NodeViewWrapper className="html-artifact-node" data-type="html-artifact">
        <div className="text-muted-foreground flex h-32 items-center justify-center rounded-lg border border-dashed">
          <span className="text-sm">{t("editor.htmlArtifact.emptyState")}</span>
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
        {title && (
          <div className="text-muted-foreground flex items-center gap-2 border-b px-3 py-1.5 text-xs">
            <Code2 className="h-3.5 w-3.5" />
            <span>{title}</span>
          </div>
        )}

        {isEditable && (
          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setIsFullscreen(true)}
              title={t("editor.htmlArtifact.fullscreen")}
              aria-label={t("editor.htmlArtifact.fullscreen")}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={handleStartEdit}
              title={t("editor.htmlArtifact.edit")}
              aria-label={t("editor.htmlArtifact.edit")}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={deleteNode}
              title={t("editor.htmlArtifact.delete")}
              aria-label={t("editor.htmlArtifact.delete")}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="overflow-hidden rounded-b-lg">
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts"
            srcDoc={wrappedHtml}
            title={iframeTitle}
            className="w-full border-0"
            style={{ height: `${iframeHeight}px` }}
          />
        </div>

        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-auto p-0">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>{iframeTitle}</DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-4">
              <iframe
                ref={fullscreenIframeRef}
                sandbox="allow-scripts"
                srcDoc={wrappedHtml}
                title={iframeTitle}
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
