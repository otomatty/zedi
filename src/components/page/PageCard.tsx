import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, Copy, Trash2 } from "lucide-react";
import type { PageSummary } from "@/types/page";
import { ZEDI_PAGE_MIME_TYPE } from "@/types/aiChat";
import { Button, cn } from "@zedi/ui";
import { useCreatePage, useDeletePage, usePage } from "@/hooks/usePageQueries";
import { useRemovePageFromNote } from "@/hooks/useNoteQueries";
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
  /**
   * ノート文脈での表示時は `noteId` を渡す。遷移先・削除セマンティクスが
   * `/notes/:noteId/:pageId` 配下に切り替わる。未指定時は従来の `/pages/:id`
   * （個人ページ向け）として動作する。
   *
   * Pass `noteId` when rendering inside a note. Navigation and the delete
   * mutation switch to the note-scoped variants. Without it the card behaves
   * as the legacy personal-page card under `/pages/:id`.
   */
  noteId?: string;
  /**
   * 削除メニューを表示するかどうか。ノート文脈ではノートの編集権 (`canEdit`)
   * を渡す。未指定時は従来通り表示する。
   *
   * Whether the delete menu item is shown. In a note context callers pass the
   * caller's `canEdit` access. When omitted the menu item is shown (legacy
   * personal-page behavior).
   */
  canDelete?: boolean;
}

/**
 * ページカードコンポーネント。デスクトップでは右クリックでコンテキストメニューを表示する。モバイルではメニュー非表示。
 * `noteId` 指定時はノート配下のカードとして遷移先・削除導線を切り替える。
 *
 * Page card component. Shows a context menu on right-click (desktop only).
 * When `noteId` is provided, navigation and delete behavior switch to the
 * note-scoped routes; otherwise it behaves as the legacy personal-page card.
 */
const PageCard: React.FC<PageCardProps> = ({ page, index = 0, noteId, canDelete = true }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const createPageMutation = useCreatePage();
  const deletePageMutation = useDeletePage();
  const removeFromNoteMutation = useRemovePageFromNote();
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

  const targetHref = noteId ? `/notes/${noteId}/${page.id}` : `/pages/${page.id}`;

  const handleClick = () => {
    // ドラッグ直後のクリックを無視 / Ignore click right after drag
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    navigate(targetHref);
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

  const isDeletePending = noteId ? removeFromNoteMutation.isPending : deletePageMutation.isPending;

  const handleDelete = () => {
    const onSuccess = () => {
      toast({
        title: t("common.page.pageDeleted"),
        description: t("common.page.deletedWithTitle", { title: displayTitle }),
      });
      setIsDeleteDialogOpen(false);
    };
    const onError = () => {
      toast({
        title: t("common.error"),
        description: t("common.page.deleteFailed"),
        variant: "destructive",
      });
      setIsDeleteDialogOpen(false);
    };

    if (noteId) {
      // ノート配下では note-scoped DELETE を使い、サーバ側 `canEdit` ガードを通す。
      // In a note context, hit the note-scoped DELETE so the server's `canEdit`
      // gate (`server/api/src/routes/notes/pages.ts`) authorizes the soft-delete.
      removeFromNoteMutation.mutate({ noteId, pageId: page.id }, { onSuccess, onError });
    } else {
      deletePageMutation.mutate(page.id, { onSuccess, onError });
    }
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

  // ノート文脈ではコピー先がページ集合（個人ページ）になるため、現状は
  // 複製メニューを出さない。後続 issue で「同ノート内に複製」を追加予定。
  // Hide duplicate inside a note: the existing flow targets the personal-page
  // collection. A note-scoped duplicate is tracked as a follow-up.
  const showDuplicate = !noteId;

  // デスクトップ用メニューアイテム / Desktop menu items
  const menuItems = (
    <>
      {showDuplicate && (
        <ContextMenuItem onClick={handleDuplicate} disabled={createPageMutation.isPending}>
          <Copy className="mr-2 h-4 w-4" />
          {t("common.page.duplicate")}
        </ContextMenuItem>
      )}
      {canDelete && (
        <>
          {showDuplicate && <ContextMenuSeparator />}
          <ContextMenuItem
            onSelect={openDeleteDialogAfterMenuClose}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("common.page.delete")}
          </ContextMenuItem>
        </>
      )}
    </>
  );

  // メニューアイテムが何もない場合はコンテキストメニューを開かない。
  // Don't open the context menu if no actions remain (e.g. read-only viewer).
  const hasMenuItems = showDuplicate || canDelete;

  // モバイルではコンテキストメニューが出せないため、ノート文脈で削除権限が
  // ある場合は旧 `NoteViewPageGrid` と同様、カード右上に常設のゴミ箱ボタン
  // を出す。`isMobile` 判定を採用するのは、デスクトップでは右クリックの
  // ContextMenu を主動線にするため（重複表示を避ける）。
  // Touch devices can't trigger the right-click context menu, so when a note
  // editor/owner is allowed to delete a page we surface a permanent trash
  // overlay (matching the previous `NoteViewPageGrid` UX). Desktop keeps the
  // context menu as the primary action to avoid double UI.
  const showMobileNoteDeleteButton = isMobile && Boolean(noteId) && canDelete;

  const cardWithMobileDelete = showMobileNoteDeleteButton ? (
    <div className="relative">
      {cardButton}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7"
        aria-label={t("common.page.delete")}
        onClick={(e) => {
          e.stopPropagation();
          setIsDeleteDialogOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  ) : (
    cardButton
  );

  return (
    <>
      {isMobile || !hasMenuItems ? (
        // モバイル or メニュー項目なし: コンテキストメニューを出さない
        // Mobile, or no available actions → render bare card without ContextMenu
        cardWithMobileDelete
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
              disabled={isDeletePending}
            >
              {isDeletePending ? t("common.page.deleting") : t("common.page.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PageCard;
