import React, { useState, useEffect, useRef } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Copy, ExternalLink, MoreHorizontal, RefreshCcw, Trash2 } from "lucide-react";
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

function ImageNodeErrorState({
  src,
  onReload,
  onCopyUrl,
}: {
  src?: string;
  onReload: () => void;
  onCopyUrl: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <p className="text-sm font-medium text-destructive">画像の読み込みに失敗しました</p>
      {src && <p className="mt-1 break-all text-xs text-muted-foreground">{src}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={onReload}>
          <RefreshCcw className="mr-1 h-4 w-4" />
          再読み込み
        </Button>
        <Button size="sm" variant="outline" onClick={onCopyUrl} disabled={!src}>
          <Copy className="mr-1 h-4 w-4" />
          URLをコピー
        </Button>
      </div>
    </div>
  );
}

function ImageNodeToolbar({
  providerLabel,
  onCopyUrl,
  onOpenUrl,
  onDeleteFromNote,
  onDeleteFromStorage,
  canDeleteFromStorage,
  isDeleting,
  confirmOpen,
  setConfirmOpen,
}: {
  providerLabel: string;
  onCopyUrl: () => void;
  onOpenUrl: () => void;
  onDeleteFromNote: () => void;
  onDeleteFromStorage: () => void;
  canDeleteFromStorage: boolean;
  isDeleting: boolean;
  confirmOpen: boolean;
  setConfirmOpen: (v: boolean) => void;
}) {
  return (
    <div className="absolute right-2 top-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
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
          <DropdownMenuItem onClick={onCopyUrl}>
            <Copy className="mr-2 h-4 w-4" />
            URLをコピー
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenUrl}>
            <ExternalLink className="mr-2 h-4 w-4" />
            別タブで開く
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDeleteFromNote}>
            <Trash2 className="mr-2 h-4 w-4" />
            メモから削除
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            disabled={!canDeleteFromStorage || isDeleting}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            ストレージから削除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ストレージから削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              ストレージ上の画像も削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteFromStorage}
              disabled={!canDeleteFromStorage || isDeleting}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
  const providerLabel = options.getProviderLabel?.(storageProviderId) || "不明";
  const canDeleteFromStorage = options.canDeleteFromStorage?.(storageProviderId);

  const [hasLoadError, setHasLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** For /api/media/ URLs: resolved blob URL so img works after reload (auth required) */
  const [authenticatedSrc, setAuthenticatedSrc] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const isAuthRequiredUrl = src != null && src.includes("/api/media/");
  const getAuthenticatedImageUrl = options.getAuthenticatedImageUrl;

  useEffect(() => {
    if (!isAuthRequiredUrl || !getAuthenticatedImageUrl || !src) return;
    let cancelled = false;
    getAuthenticatedImageUrl(src).then((blobUrl) => {
      if (cancelled) return;
      if (blobUrl) {
        blobUrlRef.current = blobUrl;
        setAuthenticatedSrc(blobUrl);
      } else {
        setHasLoadError(true);
      }
    });
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [src, isAuthRequiredUrl, getAuthenticatedImageUrl, reloadKey]);

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
    setAuthenticatedSrc(null);
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
    <NodeViewWrapper className="my-4 max-w-full">
      <div
        className={`group relative inline-block max-w-full ${
          selected ? "rounded-lg ring-2 ring-primary" : ""
        }`}
      >
        {hasLoadError ? (
          <ImageNodeErrorState src={src} onReload={handleReload} onCopyUrl={handleCopyUrl} />
        ) : isAuthRequiredUrl && !authenticatedSrc && getAuthenticatedImageUrl ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border bg-muted/50 text-sm text-muted-foreground">
            読み込み中…
          </div>
        ) : (
          <img
            key={reloadKey}
            src={isAuthRequiredUrl && authenticatedSrc ? authenticatedSrc : src}
            alt={alt || "image"}
            title={title}
            className="block h-auto w-auto max-w-full rounded-lg border bg-background"
            onError={() => setHasLoadError(true)}
          />
        )}

        <ImageNodeToolbar
          providerLabel={providerLabel}
          onCopyUrl={handleCopyUrl}
          onOpenUrl={handleOpenUrl}
          onDeleteFromNote={handleDeleteFromNote}
          onDeleteFromStorage={handleDeleteFromStorage}
          canDeleteFromStorage={Boolean(canDeleteFromStorage)}
          isDeleting={isDeleting}
          confirmOpen={confirmOpen}
          setConfirmOpen={setConfirmOpen}
        />
      </div>
    </NodeViewWrapper>
  );
};
