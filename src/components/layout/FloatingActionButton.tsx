import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCreateNewPage } from "@/hooks/useCreateNewPage";
import { useCreatePage } from "@/hooks/usePageQueries";
import { useToast } from "@/hooks/use-toast";
import { FABMenu, type FABMenuOption } from "./FABMenu";
import { WebClipperDialog } from "@/components/editor/WebClipperDialog";
import { ImageCreateDialog } from "./ImageCreateDialog";

const FloatingActionButton: React.FC = () => {
  const navigate = useNavigate();
  const { createNewPage, isCreating } = useCreateNewPage();
  const createPageMutation = useCreatePage();
  const { toast } = useToast();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isWebClipperOpen, setIsWebClipperOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);

  const handleMenuSelect = async (option: FABMenuOption) => {
    switch (option) {
      case "blank":
        // 従来の動作：空白ページ作成
        await createNewPage();
        break;
      case "url":
        // URLから作成ダイアログを開く
        setIsWebClipperOpen(true);
        break;
      case "image":
        // 画像から作成ダイアログを開く
        setIsImageDialogOpen(true);
        break;
      case "template":
        // TODO: テンプレート選択画面
        toast({
          title: "準備中",
          description: "テンプレート機能は近日公開予定です",
        });
        break;
      case "voice":
        // TODO: 音声録音画面
        toast({
          title: "準備中",
          description: "音声入力機能は近日公開予定です",
        });
        break;
    }
  };

  // URLから作成完了時の処理
  const handleWebClipped = async (
    title: string,
    content: string,
    sourceUrl: string,
    thumbnailUrl?: string | null
  ) => {
    try {
      // 新しいページを作成
      const newPage = await createPageMutation.mutateAsync({
        title,
        content,
      });

      // sourceUrl と thumbnailUrl を含む更新は PageEditor で行われる
      // ここでは基本的なページ作成後にナビゲート
      navigate(`/page/${newPage.id}`, {
        state: {
          sourceUrl,
          thumbnailUrl,
        },
      });
    } catch (error) {
      console.error("Failed to create page from URL:", error);
      toast({
        title: "ページの作成に失敗しました",
        variant: "destructive",
      });
    }
  };

  // 画像から作成完了時の処理
  const handleImageCreated = async (
    imageUrl: string,
    extractedText?: string,
    description?: string
  ) => {
    try {
      // コンテンツを構築
      let content = "";

      // 画像を挿入
      const imageBlock = {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: imageUrl,
              alt: description || "Uploaded image",
            },
          },
          {
            type: "paragraph",
            content: extractedText
              ? [{ type: "text", text: extractedText }]
              : [],
          },
        ],
      };
      content = JSON.stringify(imageBlock);

      // ページを作成
      const newPage = await createPageMutation.mutateAsync({
        title: "",
        content,
      });

      navigate(`/page/${newPage.id}`);
    } catch (error) {
      console.error("Failed to create page from image:", error);
      toast({
        title: "ページの作成に失敗しました",
        variant: "destructive",
      });
    }
  };

  // メインFABボタン
  const fabButton = (
    <Button
      onClick={() => setIsMenuOpen(!isMenuOpen)}
      disabled={isCreating}
      size="icon"
      className={cn(
        "h-14 w-14 rounded-full",
        "shadow-elevated hover:shadow-glow",
        "transition-all duration-300",
        isMenuOpen && "bg-muted-foreground hover:bg-muted-foreground/90"
      )}
    >
      {isMenuOpen ? (
        <X className="h-6 w-6" />
      ) : (
        <Plus className="h-6 w-6" />
      )}
    </Button>
  );

  return (
    <>
      <FABMenu
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        onSelect={handleMenuSelect}
        trigger={fabButton}
      />

      {/* URL から作成ダイアログ */}
      <WebClipperDialog
        open={isWebClipperOpen}
        onOpenChange={setIsWebClipperOpen}
        onClipped={handleWebClipped}
      />

      {/* 画像から作成ダイアログ */}
      <ImageCreateDialog
        open={isImageDialogOpen}
        onOpenChange={setIsImageDialogOpen}
        onCreated={handleImageCreated}
      />
    </>
  );
};

export default FloatingActionButton;
