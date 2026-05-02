import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, Copy, Trash2 } from "lucide-react";
import type { PageSummary } from "@/types/page";
import { ZEDI_PAGE_MIME_TYPE } from "@/types/aiChat";
import { cn } from "@zedi/ui";
import { useCreatePage, useDeletePage, usePage } from "@/hooks/usePageQueries";
import { useToast } from "@zedi/ui";
import { useIsMobile } from "@zedi/ui/hooks/use-mobile";
import { useAuthenticatedImageUrl } from "@/hooks/useAuthenticatedImageUrl";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@zedi/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";

interface PageCardProps {
  page: PageSummary;
  index?: number;
}

/**
 * ページカードコンポーネント。デスクトップでは右クリックでコンテキストメニューを表示する。モバイルではメニュー非表示。
 * Page card component. Shows context menu on right-click (desktop only). No context menu on mobile.
 */
const PageCard: React.FC<PageCardProps> = ({ page, index = 0 }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const createPageMutation = useCreatePage();
  const deletePageMutation = useDeletePage();
  const pageDetailQuery = usePage(page.id, { enabled: false });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const isMobile = useIsMobile();

  const preview = page.contentPreview ?? "";
  const { resolvedUrl: thumbnail, hasError: thumbnailError } = useAuthenticatedImageUrl(
    page.thumbnailUrl,
  );
  const isClipped = !!page.sourceUrl;
  const displayTitle = page.title || t("common.untitledPage");

  const handleClick = () => {
    // ドラッグ直後のクリックを無視 / Ignore click right after drag
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    navigate(`/pages/${page.id}`);
  };

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const data = JSON.stringify({ id: page.id, title: displayTitle });
      e.dataTransfer.setData(ZEDI_PAGE_MIME_TYPE, data);
      e.dataTransfer.effectAllowed = "link";
      setIsDragging(true);
      isDraggingRef.current = true;
    },
    [page.id, displayTitle],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    // クリック抑制は短い遅延後にリセット / Reset click suppression after short delay
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  }, []);

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (createPageMutation.isPending) return;

    try {
      const { data: fullPage } = await pageDetailQuery.refetch();
      if (!fullPage) {
        throw new Error("Page not found");
      }

      const newTitle = `${displayTitle}${t("common.page.titleCopySuffix")}`;
      const newPage = await createPageMutation.mutateAsync({
        title: newTitle,
        content: fullPage.content,
      });

      toast({
        title: t("common.page.duplicated"),
        description: t("common.page.duplicatedWithTitle", { title: newTitle }),
      });
      navigate(`/pages/${newPage.id}`);
    } catch (error) {
      console.error("Failed to duplicate page:", error);
      toast({
        title: t("common.error"),
        description: t("common.page.duplicateFailed"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = () => {
    deletePageMutation.mutate(page.id, {
      onSuccess: () => {
        toast({
          title: t("common.page.pageDeleted"),
          description: t("common.page.deletedWithTitle", { title: displayTitle }),
        });
        setIsDeleteDialogOpen(false);
      },
      onError: () => {
        toast({
          title: t("common.error"),
          description: t("common.page.deleteFailed"),
          variant: "destructive",
        });
        setIsDeleteDialogOpen(false);
      },
    });
  };

  const openDeleteDialogAfterMenuClose = useCallback(() => {
    requestAnimationFrame(() => {
      setIsDeleteDialogOpen(true);
    });
  }, []);

  // カード本体の button 要素 / Card button element
  const cardButton = (
    <button
      draggable={!isMobile}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={cn(
        "page-card w-full overflow-hidden rounded-lg text-left",
        "border-border/50 bg-card hover:border-border border",
        "group transition-all duration-200",
        "animate-fade-in opacity-0",
        "flex aspect-square flex-col",
        index <= 5 && `stagger-${Math.min(index + 1, 5)}`,
        isDragging && "ring-primary opacity-50 ring-2",
      )}
      style={{
        animationFillMode: "forwards",
        animationDelay: `${index * 50}ms`,
      }}
    >
      {/* Title - Top */}
      <div className="flex-shrink-0 p-3 pb-2">
        <div className="flex items-start gap-1.5">
          {isClipped && <Link2 className="text-primary mt-0.5 h-4 w-4 shrink-0" />}
          <h3 className="text-foreground line-clamp-2 text-sm font-medium">{displayTitle}</h3>
        </div>
      </div>

      {/* Thumbnail or Preview - Bottom */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {thumbnail && !thumbnailError ? (
          <div className="flex h-full w-full items-center justify-center px-3 pt-0 pb-3">
            <img
              src={thumbnail}
              alt=""
              className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
              decoding="async"
              loading="lazy"
              {...({ fetchpriority: "low" } as React.ImgHTMLAttributes<HTMLImageElement>)}
            />
          </div>
        ) : (
          <div className="h-full px-3 pb-3">
            <p className="text-muted-foreground line-clamp-4 text-xs leading-relaxed">
              {preview || t("common.page.noContent")}
            </p>
          </div>
        )}
      </div>
    </button>
  );

  // デスクトップ用メニューアイテム / Desktop menu items
  const menuItems = (
    <>
      <ContextMenuItem onClick={handleDuplicate} disabled={createPageMutation.isPending}>
        <Copy className="mr-2 h-4 w-4" />
        {t("common.page.duplicate")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={openDeleteDialogAfterMenuClose}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        {t("common.page.delete")}
      </ContextMenuItem>
    </>
  );

  return (
    <>
      {isMobile ? (
        // モバイル: コンテキストメニューなし / Mobile: no context menu
        cardButton
      ) : (
        // デスクトップ: 右クリックで ContextMenu を表示 / Desktop: right-click opens ContextMenu
        <ContextMenu modal={false}>
          <ContextMenuTrigger asChild>{cardButton}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">{menuItems}</ContextMenuContent>
        </ContextMenu>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.page.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.page.deleteBody", { title: displayTitle })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePageMutation.isPending}
            >
              {deletePageMutation.isPending ? t("common.page.deleting") : t("common.page.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PageCard;
