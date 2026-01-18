import React, { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  Copy,
  ExternalLink,
  MoreHorizontal,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { StorageImageOptions } from "./extensions/StorageImageExtension";

export const ImageNodeView: React.FC<NodeViewProps> = ({
  node,
  selected,
  extension,
  deleteNode,
}) => {
  const { src, alt, title, storageProviderId } = node.attrs as {
    src?: string;
    alt?: string;
    title?: string;
    storageProviderId?: string | null;
  };

  const options = extension.options as StorageImageOptions;
  const providerLabel =
    options.getProviderLabel?.(storageProviderId) || "不明";
  const canDeleteFromStorage = options.canDeleteFromStorage?.(storageProviderId);

  const [hasLoadError, setHasLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleCopyUrl = () => {
    if (!src) return;
    options.onCopyUrl?.(src);
  };

  const handleOpenUrl = () => {
    if (!src) return;
    if (options.onOpenUrl) {
      options.onOpenUrl(src);
      return;
    }
    window.open(src, "_blank", "noopener,noreferrer");
  };

  const handleReload = () => {
    setHasLoadError(false);
    setReloadKey((prev) => prev + 1);
  };

  const handleDeleteFromNote = () => {
    deleteNode();
  };

  const handleDeleteFromStorage = async () => {
    if (!src || !options.onDeleteFromStorage) return;
    setIsDeleting(true);
    try {
      await options.onDeleteFromStorage(src, storageProviderId);
      deleteNode();
    } catch {
      // Error is surfaced via toast in handler.
    } finally {
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <NodeViewWrapper className="my-4">
      <div
        className={`relative group ${
          selected ? "ring-2 ring-primary rounded-lg" : ""
        }`}
      >
        {hasLoadError ? (
          <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-4">
            <p className="text-sm text-destructive font-medium">
              画像の読み込みに失敗しました
            </p>
            {src && (
              <p className="text-xs text-muted-foreground break-all mt-1">
                {src}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={handleReload}>
                <RefreshCcw className="h-4 w-4 mr-1" />
                再読み込み
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopyUrl}>
                <Copy className="h-4 w-4 mr-1" />
                URLをコピー
              </Button>
            </div>
          </div>
        ) : (
          <img
            key={reloadKey}
            src={src}
            alt={alt || "image"}
            title={title}
            className="w-full max-w-[480px] h-auto rounded-lg border bg-background"
            onError={() => setHasLoadError(true)}
          />
        )}

        <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Badge variant="secondary" className="text-[10px]">
            保存先: {providerLabel}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopyUrl}>
                <Copy className="h-4 w-4 mr-2" />
                URLをコピー
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenUrl}>
                <ExternalLink className="h-4 w-4 mr-2" />
                別タブで開く
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDeleteFromNote}>
                <Trash2 className="h-4 w-4 mr-2" />
                メモから削除
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                disabled={!canDeleteFromStorage || isDeleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                ストレージから削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ストレージから削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                ストレージ上の画像も削除されます。この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteFromStorage}
                disabled={isDeleting}
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </NodeViewWrapper>
  );
};
