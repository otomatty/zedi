import React, { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@zedi/ui";
import { cn } from "@zedi/ui";
import { useCreateNewPage } from "@/hooks/pages/useCreateNewPage";
import { FABMenu, type FABMenuOption } from "./FABMenu";
import { WebClipperDialog } from "@/components/editor/WebClipperDialog";
import { ImageCreateDialog } from "./ImageCreateDialog";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@zedi/ui";
import { useAuth } from "@/hooks/auth/useAuth";
import { useFloatingActionButtonHandlers } from "./useFloatingActionButtonHandlers";

/**
 * FAB 共通プロパティ。`noteId` が指定されるとノート配下ページとして作成・遷移する。
 * Common FAB props. When `noteId` is supplied the FAB creates pages scoped to
 * that note and routes to `/notes/:noteId/:pageId` instead of the
 * standalone `/pages/:id`.
 *
 * When initialClipUrl is provided, onClipDialogClosedWithInitialUrl is required
 * so the dialog can be closed and URL cleared.
 */
type FloatingActionButtonProps = {
  noteId?: string;
  /**
   * 追加で非表示にするメニュー項目。未サインイン時は FAB 自体が描画されない
   * （ページ作成はサインイン必須、Issue #1020）。
   *
   * Additional menu options to hide. For guests the FAB renders nothing at
   * all — page creation requires sign-in (issue #1020).
   */
  hiddenOptions?: FABMenuOption[];
} & (
  | {
      initialClipUrl?: null;
      onClipDialogClosedWithInitialUrl?: never;
    }
  | {
      initialClipUrl: string;
      onClipDialogClosedWithInitialUrl: () => void;
    }
);

/**
 * ホーム／ノート詳細用フローティングアクションボタン。新規・URL・画像作成メニューを表示する。
 * FAB for home and note detail: shows menu for new page, URL clip, image create.
 * When `noteId` is supplied the created page is linked to that note.
 */
const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  initialClipUrl,
  onClipDialogClosedWithInitialUrl,
  noteId,
  hiddenOptions: extraHiddenOptions,
}) => {
  const { t } = useTranslation();
  const { createNewPage, isCreating } = useCreateNewPage({ noteId });
  const { isSignedIn } = useAuth();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isWebClipperOpen, setIsWebClipperOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      queueMicrotask(() => setIsWebClipperOpen(false));
    }
  }, [isSignedIn]);

  const isWebClipperOpenDerived = isWebClipperOpen || Boolean(initialClipUrl && isSignedIn);

  const handlers = useFloatingActionButtonHandlers({
    createNewPage,
    setIsWebClipperOpen,
    setIsImageDialogOpen,
    noteId,
  });

  const hiddenOptions: FABMenuOption[] | undefined =
    extraHiddenOptions && extraHiddenOptions.length > 0 ? extraHiddenOptions : undefined;

  // ページ作成はサインイン必須（Issue #1020 でゲストのローカル作成を廃止）。
  // FAB のメニューは全てページ作成系のため、未サインイン時は FAB 自体を出さない。
  // Page creation requires sign-in (guest-local creation was retired by issue
  // #1020). Every FAB menu option creates a page, so hide the FAB for guests.
  if (!isSignedIn) {
    return null;
  }

  const fabButton = (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-testid="home-fab"
            aria-label={t("common.createPageAction")}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            disabled={isCreating}
            className={cn(
              "h-16 w-16 rounded-full",
              "shadow-elevated",
              "transition-all duration-300 ease-in-out",
              "hover:bg-primary hover:scale-105",
              // FAB の + / × を 16px（Tailwind size-4）で表示する。
              // Button 基底も [&_svg]:size-4 だが、意図を明示するため付与する。
              "[&_svg]:size-4",
              isMenuOpen && "bg-muted-foreground hover:bg-muted-foreground",
            )}
          >
            {isMenuOpen ? <X /> : <Plus />}
          </Button>
        </TooltipTrigger>
        {!isMenuOpen && <TooltipContent side="left">{t("common.createPageAction")}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <>
      <FABMenu
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        onSelect={handlers.handleMenuSelect}
        trigger={fabButton}
        hiddenOptions={hiddenOptions}
      />

      {isSignedIn && (
        <WebClipperDialog
          open={isWebClipperOpenDerived}
          onOpenChange={(open) => {
            setIsWebClipperOpen(false);
            if (!open && initialClipUrl && onClipDialogClosedWithInitialUrl) {
              onClipDialogClosedWithInitialUrl();
            }
          }}
          onClipped={handlers.handleWebClipped}
          initialUrl={initialClipUrl ?? undefined}
        />
      )}

      <ImageCreateDialog
        open={isImageDialogOpen}
        onOpenChange={setIsImageDialogOpen}
        onCreated={handlers.handleImageCreated}
      />
    </>
  );
};

export default FloatingActionButton;
