import React from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlertTriangle, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { Progress } from "@zedi/ui";
import type { ImageUploadOptions } from "./extensions/ImageUploadExtension";

const clampProgress = (value: number) => Math.max(0, Math.min(100, value));

/**
 *
 */
export /**
 *
 */
const ImageUploadNodeView: React.FC<NodeViewProps> = ({
  node,
  selected,
  extension,
  deleteNode,
}) => {
  /**
   *
   */
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

  /**
   *
   */
  const options = extension.options as ImageUploadOptions;
  /**
   *
   */
  const providerLabel = options.getProviderLabel?.(providerId);
  /**
   *
   */
  const normalizedProgress = clampProgress(Number(progress) || 0);

  /**
   *
   */
  const handleRetry = () => {
    if (uploadId) {
      options.onRetry?.(uploadId);
    }
  };

  /**
   *
   */
  const handleRemove = () => {
    if (uploadId && options.onRemove) {
      options.onRemove(uploadId);
      return;
    }
    deleteNode();
  };

  return (
    <NodeViewWrapper className="my-4">
      <div className={`bg-muted/30 rounded-lg border p-3 ${selected ? "ring-primary ring-2" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              {status === "error" ? "画像アップロードに失敗しました" : "画像をアップロード中"}
            </p>
            {fileName && <p className="text-muted-foreground truncate text-xs">{fileName}</p>}
            {providerLabel && (
              <p className="text-muted-foreground text-xs">保存先: {providerLabel}</p>
            )}
          </div>
          {status === "uploading" && (
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          )}
          {status === "error" && <AlertTriangle className="text-destructive h-4 w-4" />}
        </div>

        <div className="mt-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={fileName || "upload preview"}
              className="bg-background block h-auto w-auto max-w-full rounded-md border"
            />
          ) : (
            <div className="bg-background flex h-32 items-center justify-center rounded-md border border-dashed">
              <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
                <ImageIcon className="h-6 w-6" />
                プレビューを準備中
              </div>
            </div>
          )}
        </div>

        {status === "uploading" && (
          <div className="mt-3 space-y-1">
            <Progress value={normalizedProgress} />
            <p className="text-muted-foreground text-right text-xs">{normalizedProgress}%</p>
          </div>
        )}

        {status === "error" && (
          <div className="mt-3 space-y-2">
            {errorMessage && (
              <p className="text-destructive text-xs whitespace-pre-wrap">{errorMessage}</p>
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
