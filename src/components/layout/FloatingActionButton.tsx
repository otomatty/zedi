import React, { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@zedi/ui";
import { cn } from "@zedi/ui";
import { useCreateNewPage } from "@/hooks/useCreateNewPage";
import { FABMenu } from "./FABMenu";
import { WebClipperDialog } from "@/components/editor/WebClipperDialog";
import { ImageCreateDialog } from "./ImageCreateDialog";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@zedi/ui";
import { useAuth } from "@/hooks/useAuth";
import { useFloatingActionButtonHandlers } from "./useFloatingActionButtonHandlers";

/** When initialClipUrl is provided, onClipDialogClosedWithInitialUrl is required so the dialog can be closed and URL cleared. */
type FloatingActionButtonProps =
  | {
      initialClipUrl?: null;
      onClipDialogClosedWithInitialUrl?: never;
    }
  | {
      initialClipUrl: string;
      onClipDialogClosedWithInitialUrl: () => void;
    };

/**
 * ホーム用フローティングアクションボタン。新規・URL・画像作成メニューを表示する。
 * FAB for home: shows menu for new page, URL clip, image create.
 */
const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  initialClipUrl,
  onClipDialogClosedWithInitialUrl,
}) => {
  const { t } = useTranslation();
  const { createNewPage, isCreating } = useCreateNewPage();
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
  });

  const fabButton = (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-tour-id="tour-fab"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            disabled={isCreating}
            className={cn(
              "h-20 w-20 rounded-full",
              "shadow-elevated",
              "transition-all duration-300 ease-in-out",
              "hover:bg-primary hover:scale-105",
              // Override Button's base `[&_svg]:size-4` so the + / × icon
              // fills the FAB instead of being shrunk to 16px.
              // Button 基底の `[&_svg]:size-4` を上書きし、+ / × アイコンが
              // 16px に縮まらず FAB に見合うサイズで表示されるようにする。
              "[&_svg]:size-10",
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
        hiddenOptions={isSignedIn ? undefined : ["url"]}
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
