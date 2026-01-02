import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
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
import { WikiGeneratorStatus } from "@/hooks/useWikiGenerator";
import { loadAISettings } from "@/lib/aiSettings";

interface WikiGeneratorButtonProps {
  title: string;
  hasContent: boolean;
  /** 生成を開始するコールバック */
  onGenerate: () => void;
  /** 現在の生成ステータス */
  status: WikiGeneratorStatus;
  disabled?: boolean;
}

export const WikiGeneratorButton: React.FC<WikiGeneratorButtonProps> = ({
  title,
  hasContent,
  onGenerate,
  status,
  disabled = false,
}) => {
  const navigate = useNavigate();
  const [showNotConfiguredDialog, setShowNotConfiguredDialog] =
    React.useState(false);

  // タイトルがない、または本文がある場合はボタンを非表示
  const shouldShowButton = title.trim() !== "" && !hasContent;

  const isGenerating = status === "generating";

  const handleClick = async () => {
    // AI設定を確認
    const settings = await loadAISettings();
    if (!settings || !settings.isConfigured || !settings.apiKey) {
      setShowNotConfiguredDialog(true);
      return;
    }

    onGenerate();
  };

  const handleGoToSettings = () => {
    setShowNotConfiguredDialog(false);
    navigate("/settings/ai");
  };

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
    </>
  );
};
