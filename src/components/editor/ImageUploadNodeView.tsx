import React from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlertTriangle, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ImageUploadOptions } from "./extensions/ImageUploadExtension";

const clampProgress = (value: number) => Math.max(0, Math.min(100, value));

export const ImageUploadNodeView: React.FC<NodeViewProps> = ({
  node,
  selected,
  extension,
  deleteNode,
}) => {
  const {
    uploadId,
    status = "uploading",
    progress = 0,
    previewUrl,
    fileName,
    errorMessage,
    providerId,
  } = node.attrs as {
    uploadId: string;
    status?: "uploading" | "error";
    progress?: number;
    previewUrl?: string | null;
    fileName?: string | null;
    errorMessage?: string | null;
    providerId?: string | null;
  };

  const options = extension.options as ImageUploadOptions;
  const providerLabel = options.getProviderLabel?.(providerId);
  const normalizedProgress = clampProgress(Number(progress) || 0);

  const handleRetry = () => {
    if (uploadId) {
      options.onRetry?.(uploadId);
    }
  };

  const handleRemove = () => {
    if (uploadId && options.onRemove) {
      options.onRemove(uploadId);
      return;
    }
    deleteNode();
  };

  return (
    <NodeViewWrapper className="my-4">
      <div
        className={`border rounded-lg p-3 bg-muted/30 ${
          selected ? "ring-2 ring-primary" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium">
              {status === "error" ? "画像アップロードに失敗しました" : "画像をアップロード中"}
            </p>
            {fileName && (
              <p className="text-xs text-muted-foreground truncate">{fileName}</p>
            )}
            {providerLabel && (
              <p className="text-xs text-muted-foreground">
                保存先: {providerLabel}
              </p>
            )}
          </div>
          {status === "uploading" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {status === "error" && (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          )}
        </div>

        <div className="mt-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={fileName || "upload preview"}
              className="w-full max-w-[480px] h-auto rounded-md border bg-background"
            />
          ) : (
            <div className="flex items-center justify-center h-32 rounded-md border border-dashed bg-background">
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                <ImageIcon className="h-6 w-6" />
                プレビューを準備中
              </div>
            </div>
          )}
        </div>

        {status === "uploading" && (
          <div className="mt-3 space-y-1">
            <Progress value={normalizedProgress} />
            <p className="text-xs text-muted-foreground text-right">
              {normalizedProgress}%
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="mt-3 space-y-2">
            {errorMessage && (
              <p className="text-xs text-destructive whitespace-pre-wrap">
                {errorMessage}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleRetry}>
                再試行
              </Button>
              <Button size="sm" variant="outline" onClick={handleRemove}>
                削除
              </Button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
