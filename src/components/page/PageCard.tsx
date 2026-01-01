import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, Copy, Trash2 } from "lucide-react";
import type { Page } from "@/types/page";
import { getContentPreview, extractFirstImage } from "@/lib/contentUtils";
import { cn } from "@/lib/utils";
import { useCreatePage, useDeletePage } from "@/hooks/usePageQueries";
import { useToast } from "@/hooks/use-toast";
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
  page: Page;
  index?: number;
}

const PageCard: React.FC<PageCardProps> = ({ page, index = 0 }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createPageMutation = useCreatePage();
  const deletePageMutation = useDeletePage();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const preview = getContentPreview(page.content, 120);
  const thumbnail = page.thumbnailUrl || extractFirstImage(page.content);
  const isClipped = !!page.sourceUrl;

  const handleClick = () => {
    navigate(`/page/${page.id}`);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newTitle = `${page.title || "無題のページ"}のコピー`;
    createPageMutation.mutate(
      { title: newTitle, content: page.content },
      {
        onSuccess: (newPage) => {
          toast({
            title: "複製しました",
            description: `「${newTitle}」を作成しました`,
          });
          navigate(`/page/${newPage.id}`);
        },
        onError: () => {
          toast({
            title: "エラー",
            description: "ページの複製に失敗しました",
            variant: "destructive",
          });
        },
      }
    );
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
            onClick={handleClick}
            className={cn(
              "page-card w-full text-left rounded-lg overflow-hidden",
              "bg-card border border-border/50 hover:border-border",
              "transition-all duration-200 group",
              "animate-fade-in opacity-0",
              "aspect-square flex flex-col",
              index <= 5 && `stagger-${Math.min(index + 1, 5)}`
            )}
            style={{
              animationFillMode: "forwards",
              animationDelay: `${index * 50}ms`,
            }}
          >
            {/* Title - Top */}
            <div className="p-3 pb-2 flex-shrink-0">
              <div className="flex items-start gap-1.5">
                {isClipped && (
                  <Link2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                )}
                <h3 className="font-medium text-sm text-foreground line-clamp-2">
                  {page.title || "無題のページ"}
                </h3>
              </div>
            </div>

            {/* Thumbnail or Preview - Bottom */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {thumbnail ? (
                <div className="h-full w-full overflow-hidden bg-muted">
                  <img
                    src={thumbnail}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="h-full px-3 pb-3">
                  <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                    {preview || "コンテンツがありません"}
                  </p>
                </div>
              )}
            </div>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            onClick={handleDuplicate}
            disabled={createPageMutation.isPending}
          >
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

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
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
