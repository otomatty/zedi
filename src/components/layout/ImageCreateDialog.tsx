import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera,
  ImageIcon,
  Clipboard,
  Loader2,
  FileText,
  MessageSquare,
  ImageOff,
} from "lucide-react";
import { Button } from "@zedi/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@zedi/ui";
import { RadioGroup, RadioGroupItem } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Alert, AlertDescription } from "@zedi/ui";
import { Progress } from "@zedi/ui";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useAISettings } from "@/hooks/useAISettings";
import { runOcr, detectOcrLanguages } from "@/lib/ocr/tesseractOcr";
import { describeImage } from "@/lib/ai/describeImage";
import { getEffectiveAPIMode } from "@/lib/aiService";
import i18n from "@/i18n";

type ProcessingMode = "ocr" | "describe" | "none";

interface ImageCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (imageUrl: string, extractedText?: string, description?: string) => void;
}

/**
 *
 */
export /**
 *
 */
const ImageCreateDialog: React.FC<ImageCreateDialogProps> = ({ open, onOpenChange, onCreated }) => {
  /**
   *
   */
  const [step, setStep] = useState<"source" | "preview">("source");
  /**
   *
   */
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  /**
   *
   */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /**
   *
   */
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("none");
  /**
   *
   */
  const [isProcessing, setIsProcessing] = useState(false);
  /**
   *
   */
  const [error, setError] = useState<string | null>(null);
  /**
   * OCR 進捗 (0-100)。null の場合は非表示 / OCR progress 0-100; null hides the UI.
   */
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);

  /**
   *
   */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   *
   */
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  /**
   * 実行中の OCR / 画像解析を中断するための AbortController
   * AbortController used to cancel in-flight OCR / describe calls.
   */
  const abortRef = useRef<AbortController | null>(null);

  /**
   *
   */
  const { uploadImage, isConfigured } = useImageUpload();
  /**
   * AI 設定 (プロバイダー・モデル・API キー) / AI settings used for the describe mode.
   */
  const { settings: aiSettings } = useAISettings();

  /**
   * describe モードが現時点で利用できない理由を返す。
   * - `not-configured`: AI 設定が未構成
   * - `unsupported-provider`: 現在のプロバイダーは describe 未対応
   * - `api-server`: `api_server` モード（本 PR では Vision 非対応、ユーザー API キーモードが必要）
   *
   * Why the describe mode is currently unavailable. Covers:
   * - `not-configured`: AI settings are not configured
   * - `unsupported-provider`: the selected provider cannot describe images yet
   * - `api-server`: `api_server` mode (server-side Vision not yet supported in this PR)
   */
  const describeUnavailableReason: "not-configured" | "unsupported-provider" | "api-server" | null =
    !aiSettings.isConfigured
      ? "not-configured"
      : aiSettings.provider === "claude-code"
        ? "unsupported-provider"
        : getEffectiveAPIMode(aiSettings) === "api_server"
          ? "api-server"
          : null;

  const clearPreviewUrl = useCallback((updateState = true) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (updateState) {
      setPreviewUrl(null);
    }
  }, []);

  const updatePreviewUrl = useCallback(
    (nextPreviewUrl: string) => {
      clearPreviewUrl(false);
      previewUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
    },
    [clearPreviewUrl],
  );

  // ダイアログを閉じたときにリセット
  // Reset all transient state and abort any in-flight OCR / describe request.
  /**
   *
   */
  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("source");
    setSelectedImage(null);
    clearPreviewUrl();
    setProcessingMode("none");
    setError(null);
    setOcrProgress(null);
    // 実行中に閉じた場合 `handleCreate` の finally が走らず frozen になるのを防ぐ
    // Ensure isProcessing is reset; otherwise an in-flight cancel can leave the dialog frozen.
    setIsProcessing(false);
    onOpenChange(false);
  }, [clearPreviewUrl, onOpenChange]);

  // コンポーネントアンマウント時も abort する / Also abort on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearPreviewUrl(false);
    };
  }, [clearPreviewUrl]);

  // 親が直接 `open=false` にしたケース（DialogContent の Esc/オーバーレイ以外、
  // たとえば外部状態で閉じる場合）に備え、`open` の遷移を監視して
  // 進行中の OCR / describe を必ず中断し、内部状態をリセットする。
  // Without this, closing via the parent could leave a previous run state
  // (preview / progress) when the dialog reopens.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("source");
    setSelectedImage(null);
    clearPreviewUrl();
    setProcessingMode("none");
    setError(null);
    setOcrProgress(null);
    setIsProcessing(false);
  }, [open, clearPreviewUrl]);

  // 画像選択
  /**
   *
   */
  const handleImageSelect = useCallback(
    (file: File) => {
      // ファイルサイズチェック (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError("画像サイズが大きすぎます（最大10MB）");
        return;
      }

      // 画像形式チェック
      /**
       *
       */
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"];
      if (!validTypes.includes(file.type)) {
        setError("この画像形式には対応していません（JPEG, PNG, GIF, WebPをお使いください）");
        return;
      }

      setSelectedImage(file);
      updatePreviewUrl(URL.createObjectURL(file));
      setError(null);
      setStep("preview");
    },
    [updatePreviewUrl],
  );

  // ファイル選択
  /**
   *
   */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      /**
       *
       */
      const file = e.target.files?.[0];
      if (file) {
        handleImageSelect(file);
      }
      // 同じファイルを再選択できるようにリセット
      e.target.value = "";
    },
    [handleImageSelect],
  );

  // クリップボードから
  /**
   *
   */
  const handleClipboard = useCallback(async () => {
    try {
      /**
       *
       */
      const items = await navigator.clipboard.read();
      for (/**
       *
       */
      const item of items) {
        /**
         *
         */
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          /**
           *
           */
          const blob = await item.getType(imageType);
          /**
           *
           */
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
  // Execute creation: upload the image, then run OCR or LLM description if requested.
  /**
   *
   */
  const handleCreate = useCallback(async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setError(null);
    setOcrProgress(null);

    // 既存の abort があれば中断し、新しい controller を用意
    // Abort any previous run and set up a fresh controller for this invocation.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // ストレージ設定確認
      if (!isConfigured) {
        setError("ストレージが設定されていません。設定画面でストレージを設定してください。");
        setIsProcessing(false);
        return;
      }

      // 画像をアップロード
      /**
       *
       */
      const imageUrl = await uploadImage(selectedImage, { signal: controller.signal });

      // 処理モードに応じた処理 / Run OCR or describe depending on the selected mode.
      /**
       *
       */
      let extractedText: string | undefined;
      /**
       *
       */
      let description: string | undefined;

      if (processingMode === "ocr") {
        // Tesseract.js でクライアントサイド OCR を実行。
        // Run Tesseract.js OCR on the device (no external API call).
        setOcrProgress(0);
        extractedText = await runOcr(selectedImage, {
          languages: detectOcrLanguages(i18n.language),
          onProgress: (percent) => setOcrProgress(percent),
          signal: controller.signal,
        });
        setOcrProgress(null);
      } else if (processingMode === "describe") {
        // AI 設定が未構成ならここには来ないはずだが防御的に弾く。
        // Guard defensively — the UI should already disable the button in this case.
        if (!aiSettings.isConfigured) {
          throw new Error(
            "画像解析には AI 設定が必要です。設定画面で AI プロバイダーを設定してください。",
          );
        }
        description = await describeImage(selectedImage, aiSettings, {
          signal: controller.signal,
        });
      }

      // Defense-in-depth: キャンセル済みなら onCreated を呼ばない。
      // Defense-in-depth: don't fire onCreated if the user cancelled mid-flight.
      if (controller.signal.aborted) {
        return;
      }

      // 作成完了コールバック
      onCreated(imageUrl, extractedText, description);
      handleClose();
    } catch (err) {
      // 中断時は静かに閉じる（ユーザーが明示的にキャンセルしたケース）。
      // Tesseract.js の `worker.terminate()` 由来のエラーは DOMException/AbortError とは
      // 限らないため、`signal.aborted` を直接確認してユーザーキャンセルを判定する。
      //
      // Silently swallow the error when the user cancelled. Tesseract's `worker.terminate()`
      // may raise a non-AbortError, so we also check `signal.aborted` directly.
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        return;
      }
      console.error("Failed to create page from image:", err);
      setError(err instanceof Error ? err.message : "画像の処理に失敗しました");
    } finally {
      setIsProcessing(false);
      setOcrProgress(null);
    }
  }, [
    selectedImage,
    processingMode,
    isConfigured,
    uploadImage,
    onCreated,
    handleClose,
    aiSettings,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            画像から作成
          </DialogTitle>
          <DialogDescription>画像を選択してページを作成します。</DialogDescription>
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
                  <div className="text-muted-foreground text-sm">その場で写真を撮る</div>
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
                  <div className="text-muted-foreground text-sm">保存済みの画像を選ぶ</div>
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
                  <div className="text-muted-foreground text-sm">コピーした画像を貼り付け</div>
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
            <div className="bg-muted relative aspect-video overflow-hidden rounded-lg">
              <img src={previewUrl} alt="Selected" className="h-full w-full object-contain" />
            </div>

            {/* 処理モード選択 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">処理方法</Label>
              <RadioGroup
                value={processingMode}
                onValueChange={(value) => setProcessingMode(value as ProcessingMode)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-3 rounded-lg border p-3">
                  <RadioGroupItem value="ocr" id="ocr" />
                  <Label htmlFor="ocr" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>テキスト抽出（OCR）</span>
                    </div>
                    <div className="text-muted-foreground text-sm">
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
                    <div className="text-muted-foreground text-sm">AIが画像の内容を文章で説明</div>
                  </Label>
                </div>

                <div className="flex items-center space-x-3 rounded-lg border p-3">
                  <RadioGroupItem value="none" id="none" />
                  <Label htmlFor="none" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <ImageOff className="h-4 w-4" />
                      <span>画像のみ</span>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      テキスト処理なし、画像だけを添付
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* describe モード選択時、AI 設定が未構成 / api_server モードなら誘導 Alert を表示 */}
            {/* Guide the user when 'describe' is selected but describe mode is unavailable. */}
            {processingMode === "describe" && describeUnavailableReason === "not-configured" && (
              <Alert variant="destructive">
                <AlertDescription>
                  画像解析には AI 設定が必要です。設定画面で AI プロバイダーを設定してください。
                </AlertDescription>
              </Alert>
            )}
            {processingMode === "describe" &&
              describeUnavailableReason === "unsupported-provider" && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Claude Code では現在この画像解析機能は未対応です。OpenAI、Anthropic、Google
                    のいずれかを「ユーザー API キー」モードで選択してください。
                  </AlertDescription>
                </Alert>
              )}
            {processingMode === "describe" && describeUnavailableReason === "api-server" && (
              <Alert variant="destructive">
                <AlertDescription>
                  画像解析は現在サーバー API モードでは未対応です。AI設定で「ユーザー API
                  キー」モードに切り替えてください。
                </AlertDescription>
              </Alert>
            )}

            {/* OCR 進捗バー / OCR progress bar */}
            {isProcessing && processingMode === "ocr" && ocrProgress !== null && (
              <div className="space-y-2">
                <div className="text-muted-foreground text-sm">
                  テキスト抽出中... {ocrProgress}%
                </div>
                <Progress value={ocrProgress} />
              </div>
            )}

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
                clearPreviewUrl();
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
              disabled={
                isProcessing ||
                !isConfigured ||
                (processingMode === "describe" && describeUnavailableReason !== null)
              }
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {processingMode === "ocr" && ocrProgress !== null
                    ? `テキスト抽出中... ${ocrProgress}%`
                    : processingMode === "describe"
                      ? "画像を解析中..."
                      : "処理中..."}
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
