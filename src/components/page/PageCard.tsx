import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, Copy, Trash2, Sparkles } from "lucide-react";
import type { PageSummary } from "@/types/page";
import { ZEDI_PAGE_MIME_TYPE } from "@/types/aiChat";
import { cn } from "@/lib/utils";
import { useCreatePage, useDeletePage, usePage } from "@/hooks/usePageQueries";
import { useToast } from "@/hooks/use-toast";
import { useAIChatStore } from "@/stores/aiChatStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "react-i18next";
import { useAuthenticatedImageUrl } from "@/hooks/useAuthenticatedImageUrl";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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

interface PageCardProps {
  page: PageSummary;
  index?: number;
}

const PageCard: React.FC<PageCardProps> = ({ page, index = 0 }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const createPageMutation = useCreatePage();
  const deletePageMutation = useDeletePage();
  const pageDetailQuery = usePage(page.id, { enabled: false });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const isMobile = useIsMobile();
  const { openPanel, setPendingPageToAdd } = useAIChatStore();

  const preview = page.contentPreview ?? "";
  const { resolvedUrl: thumbnail, hasError: thumbnailError } = useAuthenticatedImageUrl(
    page.thumbnailUrl,
  );
  const isClipped = !!page.sourceUrl;

  const handleClick = () => {
    // ドラッグ直後のクリックを無視
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    navigate(`/page/${page.id}`);
  };

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const data = JSON.stringify({ id: page.id, title: page.title || "無題のページ" });
      e.dataTransfer.setData(ZEDI_PAGE_MIME_TYPE, data);
      e.dataTransfer.effectAllowed = "link";
      setIsDragging(true);
      isDraggingRef.current = true;
    },
    [page.id, page.title],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    // クリック抑制は短い遅延後にリセット
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  }, []);

  const handleAddToAIChat = useCallback(() => {
    const title = page.title || "無題のページ";
    setPendingPageToAdd({ id: page.id, title });
    openPanel();
  }, [page.id, page.title, setPendingPageToAdd, openPanel]);

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (createPageMutation.isPending) return;

    try {
      const { data: fullPage } = await pageDetailQuery.refetch();
      if (!fullPage) {
        throw new Error("Page not found");
      }

      const newTitle = `${page.title || "無題のページ"}のコピー`;
      const newPage = await createPageMutation.mutateAsync({
        title: newTitle,
        content: fullPage.content,
      });

      toast({
        title: "複製しました",
        description: `「${newTitle}」を作成しました`,
      });
      navigate(`/page/${newPage.id}`);
    } catch (error) {
      console.error("Failed to duplicate page:", error);
      toast({
        title: "エラー",
        description: "ページの複製に失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleDelete = () => {
    deletePageMutation.mutate(page.id, {
      onSuccess: () => {
        toast({
          title: "削除しました",
          description: `「${page.title || "無題のページ"}」を削除しました`,
        });
        setIsDeleteDialogOpen(false);
      },
      onError: () => {
        toast({
          title: "エラー",
          description: "ページの削除に失敗しました",
          variant: "destructive",
        });
        setIsDeleteDialogOpen(false);
      },
    });
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            draggable={!isMobile}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={handleClick}
            className={cn(
              "page-card w-full overflow-hidden rounded-lg text-left",
              "border border-border/50 bg-card hover:border-border",
              "group transition-all duration-200",
              "animate-fade-in opacity-0",
              "flex aspect-square flex-col",
              index <= 5 && `stagger-${Math.min(index + 1, 5)}`,
              isDragging && "opacity-50 ring-2 ring-primary",
            )}
            style={{
              animationFillMode: "forwards",
              animationDelay: `${index * 50}ms`,
            }}
          >
            {/* Title - Top */}
            <div className="flex-shrink-0 p-3 pb-2">
              <div className="flex items-start gap-1.5">
                {isClipped && <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                  {page.title || "無題のページ"}
                </h3>
              </div>
            </div>

            {/* Thumbnail or Preview - Bottom */}
            <div className="min-h-0 flex-1 overflow-hidden">
              {thumbnail && !thumbnailError ? (
                <div className="flex h-full w-full items-center justify-center px-3 pb-3 pt-0">
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
                  <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                    {preview || "コンテンツがありません"}
                  </p>
                </div>
              )}
            </div>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={handleAddToAIChat}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("aiChat.referencedPages.addToChat")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDuplicate} disabled={createPageMutation.isPending}>
            <Copy className="mr-2 h-4 w-4" />
            複製
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            削除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ページを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{page.title || "無題のページ"}
              」を削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePageMutation.isPending}
            >
              {deletePageMutation.isPending ? "削除中..." : "削除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PageCard;
