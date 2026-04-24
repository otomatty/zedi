import React, { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@zedi/ui";
import { cn } from "@zedi/ui";
import { useCreateNewPage } from "@/hooks/useCreateNewPage";
import { FABMenu, type FABMenuOption } from "./FABMenu";
import { WebClipperDialog } from "@/components/editor/WebClipperDialog";
import { ImageCreateDialog } from "./ImageCreateDialog";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@zedi/ui";
import { useAuth } from "@/hooks/useAuth";
import { useFloatingActionButtonHandlers } from "./useFloatingActionButtonHandlers";

/**
 * FAB 共通プロパティ。`noteId` が指定されるとノート配下ページとして作成・遷移する。
 * Common FAB props. When `noteId` is supplied the FAB creates pages scoped to
 * that note and routes to `/notes/:noteId/:pageId` instead of the
 * standalone `/pages/:id`.
 *
 * When initialClipUrl is provided, onClipDialogClosedWithInitialUrl is required
 * so the dialog can be closed and URL cleared.
 *
 * `onAddExistingPage` が渡されたとき、FAB メニューに「既存のページを追加」
 * 項目が表示される。`noteId` とあわせて渡すことを想定している。
 * When `onAddExistingPage` is provided, the FAB menu exposes an "add existing
 * page" entry that invokes it. Intended to be paired with `noteId`.
 */
type FloatingActionButtonProps = {
  noteId?: string;
  onAddExistingPage?: () => void;
  /**
   * 追加で非表示にするメニュー項目。未ログイン時の `url` 非表示ロジックは
   * 内部で自動適用されるため、重ねて渡す必要はない。
   *
   * Additional menu options to hide. The built-in `url` hide rule for guests is
   * applied automatically, so callers don't need to re-specify it.
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
  onAddExistingPage,
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
    onAddExistingPage,
  });

  const mergedHidden: FABMenuOption[] = [
    ...(isSignedIn ? [] : (["url"] as FABMenuOption[])),
    ...(extraHiddenOptions ?? []),
  ];
  const hiddenOptions: FABMenuOption[] | undefined =
    mergedHidden.length > 0 ? mergedHidden : undefined;
  const extraOptions: FABMenuOption[] | undefined = onAddExistingPage ? ["addExisting"] : undefined;

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
        extraOptions={extraOptions}
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
