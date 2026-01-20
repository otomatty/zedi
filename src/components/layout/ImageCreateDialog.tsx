import React, { useState, useRef, useCallback } from "react";
import {
  Camera,
  ImageIcon,
  Clipboard,
  Loader2,
  FileText,
  MessageSquare,
  ImageOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useImageUpload } from "@/hooks/useImageUpload";

type ImageSource = "camera" | "gallery" | "clipboard";
type ProcessingMode = "ocr" | "describe" | "none";

interface ImageCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (
    imageUrl: string,
    extractedText?: string,
    description?: string
  ) => void;
}

export const ImageCreateDialog: React.FC<ImageCreateDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
}) => {
  const [step, setStep] = useState<"source" | "preview">("source");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("none");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { uploadImage, isConfigured } = useImageUpload();

  // ダイアログを閉じたときにリセット
  const handleClose = useCallback(() => {
    setStep("source");
    setSelectedImage(null);
    setPreviewUrl(null);
    setProcessingMode("none");
    setError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  // 画像選択
  const handleImageSelect = useCallback((file: File) => {
    // ファイルサイズチェック (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("画像サイズが大きすぎます（最大10MB）");
      return;
    }

    // 画像形式チェック
    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
    ];
    if (!validTypes.includes(file.type)) {
      setError(
        "この画像形式には対応していません（JPEG, PNG, GIF, WebPをお使いください）"
      );
      return;
    }

    setSelectedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setStep("preview");
  }, []);

  // ファイル選択
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleImageSelect(file);
      }
      // 同じファイルを再選択できるようにリセット
      e.target.value = "";
    },
    [handleImageSelect]
  );

  // クリップボードから
  const handleClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "clipboard-image.png", {
            type: imageType,
          });
          handleImageSelect(file);
          return;
        }
      }
      setError("クリップボードに画像がありません");
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      setError("クリップボードへのアクセスに失敗しました");
    }
  }, [handleImageSelect]);

  // 作成実行
  const handleCreate = useCallback(async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setError(null);

    try {
      // ストレージ設定確認
      if (!isConfigured) {
        setError(
          "ストレージが設定されていません。設定画面でストレージを設定してください。"
        );
        setIsProcessing(false);
        return;
      }

      // 画像をアップロード
      const imageUrl = await uploadImage(selectedImage);

      // 処理モードに応じた処理
      let extractedText: string | undefined;
      let description: string | undefined;

      if (processingMode === "ocr") {
        // TODO: OCR処理を実装
        // 現在は空のテキストを返す
        extractedText = "";
      } else if (processingMode === "describe") {
        // TODO: AI画像説明生成を実装
        // 現在は空の説明を返す
        description = "";
      }

      // 作成完了コールバック
      onCreated(imageUrl, extractedText, description);
      handleClose();
    } catch (err) {
      console.error("Failed to create page from image:", err);
      setError(
        err instanceof Error ? err.message : "画像の処理に失敗しました"
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    selectedImage,
    processingMode,
    isConfigured,
    uploadImage,
    onCreated,
    handleClose,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            画像から作成
          </DialogTitle>
          <DialogDescription>
            画像を選択してページを作成します。
          </DialogDescription>
        </DialogHeader>

        {/* ソース選択ステップ */}
        {step === "source" && (
          <div className="space-y-4 py-4">
            <div className="grid gap-3">
              {/* カメラ */}
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 p-4"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">カメラで撮影</div>
                  <div className="text-sm text-muted-foreground">
                    その場で写真を撮る
                  </div>
                </div>
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* ギャラリー */}
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 p-4"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">ギャラリーから選択</div>
                  <div className="text-sm text-muted-foreground">
                    保存済みの画像を選ぶ
                  </div>
                </div>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* クリップボード */}
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 p-4"
                onClick={handleClipboard}
              >
                <Clipboard className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">クリップボードから</div>
                  <div className="text-sm text-muted-foreground">
                    コピーした画像を貼り付け
                  </div>
                </div>
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* プレビューステップ */}
        {step === "preview" && previewUrl && (
          <div className="space-y-4 py-4">
            {/* 画像プレビュー */}
            <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
              <img
                src={previewUrl}
                alt="Selected"
                className="h-full w-full object-contain"
              />
            </div>

            {/* 処理モード選択 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">処理方法</Label>
              <RadioGroup
                value={processingMode}
                onValueChange={(value) =>
                  setProcessingMode(value as ProcessingMode)
                }
                className="space-y-2"
              >
                <div className="flex items-center space-x-3 rounded-lg border p-3">
                  <RadioGroupItem value="ocr" id="ocr" />
                  <Label htmlFor="ocr" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>テキスト抽出（OCR）</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      画像内の文字を認識してテキスト化
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-3 rounded-lg border p-3">
                  <RadioGroupItem value="describe" id="describe" />
                  <Label htmlFor="describe" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <span>画像の説明を生成</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      AIが画像の内容を文章で説明
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-3 rounded-lg border p-3">
                  <RadioGroupItem value="none" id="none" />
                  <Label htmlFor="none" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <ImageOff className="h-4 w-4" />
                      <span>画像のみ</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      テキスト処理なし、画像だけを添付
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!isConfigured && (
              <Alert>
                <AlertDescription>
                  画像をアップロードするには、設定画面でストレージを設定してください。
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "preview" && (
            <Button
              variant="outline"
              onClick={() => {
                setStep("source");
                setSelectedImage(null);
                setPreviewUrl(null);
                setError(null);
              }}
              disabled={isProcessing}
            >
              戻る
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            キャンセル
          </Button>
          {step === "preview" && (
            <Button
              onClick={handleCreate}
              disabled={isProcessing || !isConfigured}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  処理中...
                </>
              ) : (
                "作成"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCreateDialog;
