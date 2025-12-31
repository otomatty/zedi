import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useWikiGenerator,
  WikiGeneratorStatus,
} from "@/hooks/useWikiGenerator";
import { loadAISettings } from "@/lib/aiSettings";

interface WikiGeneratorButtonProps {
  title: string;
  hasContent: boolean;
  onGenerated: (tiptapContent: string) => void;
  disabled?: boolean;
}

export const WikiGeneratorButton: React.FC<WikiGeneratorButtonProps> = ({
  title,
  hasContent,
  onGenerated,
  disabled = false,
}) => {
  const navigate = useNavigate();
  const {
    status,
    streamedContent,
    error,
    generate,
    cancel,
    reset,
    getTiptapContent,
  } = useWikiGenerator();

  const [showNotConfiguredDialog, setShowNotConfiguredDialog] =
    React.useState(false);

  // タイトルがない、または本文がある場合はボタンを非表示
  const shouldShowButton = title.trim() !== "" && !hasContent;

  // 生成完了時にコールバックを呼び出す
  useEffect(() => {
    if (status === "completed") {
      const tiptapContent = getTiptapContent();
      if (tiptapContent) {
        onGenerated(tiptapContent);
        reset();
      }
    }
  }, [status, getTiptapContent, onGenerated, reset]);

  const handleClick = async () => {
    // AI設定を確認
    const settings = await loadAISettings();
    if (!settings || !settings.isConfigured || !settings.apiKey) {
      setShowNotConfiguredDialog(true);
      return;
    }

    generate(title);
  };

  const handleGoToSettings = () => {
    setShowNotConfiguredDialog(false);
    navigate("/settings/ai");
  };

  // 生成中のダイアログ
  const isGenerating = status === "generating";

  if (!shouldShowButton) {
    return null;
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={disabled || isGenerating}
            className="gap-1.5"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Wiki生成</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>AIでWikipedia風の解説を生成</p>
        </TooltipContent>
      </Tooltip>

      {/* AI未設定ダイアログ */}
      <Dialog
        open={showNotConfiguredDialog}
        onOpenChange={setShowNotConfiguredDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              AI設定が必要です
            </DialogTitle>
            <DialogDescription>
              Wiki生成機能を使用するには、AI設定でAPIキーを設定してください。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNotConfiguredDialog(false)}
            >
              キャンセル
            </Button>
            <Button onClick={handleGoToSettings}>設定画面へ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 生成中ダイアログ */}
      <Dialog open={isGenerating} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-lg" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              生成中...
            </DialogTitle>
            <DialogDescription>
              「{title}」について解説を生成しています。
            </DialogDescription>
          </DialogHeader>

          {/* ストリーミングプレビュー */}
          <div className="max-h-[300px] overflow-y-auto rounded-md border bg-muted/50 p-4">
            <pre className="whitespace-pre-wrap text-sm font-mono">
              {streamedContent || "生成を開始しています..."}
            </pre>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancel}>
              <X className="h-4 w-4 mr-2" />
              キャンセル
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* エラーダイアログ */}
      <Dialog open={status === "error"} onOpenChange={() => reset()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              生成エラー
            </DialogTitle>
            <DialogDescription>
              {error?.message === "AI_NOT_CONFIGURED"
                ? "AI設定が必要です。設定画面でAPIキーを入力してください。"
                : error?.message || "生成中にエラーが発生しました。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {error?.message === "AI_NOT_CONFIGURED" ? (
              <Button onClick={handleGoToSettings}>設定画面へ</Button>
            ) : (
              <Button variant="outline" onClick={() => reset()}>
                閉じる
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
