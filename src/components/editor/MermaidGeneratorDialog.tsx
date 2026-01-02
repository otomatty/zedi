import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, AlertCircle } from "lucide-react";
import { useMermaidGenerator } from "@/hooks/useMermaidGenerator";
import { DIAGRAM_TYPES, MermaidDiagramType } from "@/lib/mermaidGenerator";

// Dynamic import for mermaid
async function getMermaid() {
  const { default: mermaid } = await import("mermaid");
  return mermaid;
}

interface MermaidGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedText: string;
  onInsert: (code: string) => void;
}

export const MermaidGeneratorDialog: React.FC<MermaidGeneratorDialogProps> = ({
  open,
  onOpenChange,
  selectedText,
  onInsert,
}) => {
  const navigate = useNavigate();
  const {
    status,
    result,
    error,
    isAIConfigured,
    generate,
    reset,
    checkAIConfigured,
  } = useMermaidGenerator();

  const [selectedTypes, setSelectedTypes] = useState<MermaidDiagramType[]>([
    "flowchart",
  ]);
  const [previewSvg, setPreviewSvg] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ダイアログが開いたときにAI設定をチェック
  useEffect(() => {
    if (open) {
      checkAIConfigured();
      reset();
      setPreviewSvg("");
      setPreviewError(null);
    }
  }, [open, checkAIConfigured, reset]);

  // 結果が来たらプレビューを生成
  useEffect(() => {
    const renderPreview = async () => {
      if (result?.code) {
        try {
          const mermaid = await getMermaid();
          await mermaid.parse(result.code);
          const id = `preview-${Math.random().toString(36).substr(2, 9)}`;
          const { svg } = await mermaid.render(id, result.code);
          setPreviewSvg(svg);
          setPreviewError(null);
        } catch (err) {
          setPreviewError(
            err instanceof Error ? err.message : "プレビューエラー"
          );
          setPreviewSvg("");
        }
      }
    };

    renderPreview();
  }, [result]);

  const handleTypeToggle = (type: MermaidDiagramType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleGenerate = () => {
    generate(selectedText, selectedTypes);
  };

  const handleInsert = () => {
    if (result?.code) {
      onInsert(result.code);
      onOpenChange(false);
    }
  };

  const handleGoToSettings = () => {
    onOpenChange(false);
    navigate("/settings/ai");
  };

  // AI未設定の場合
  if (isAIConfigured === false) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              AI設定が必要です
            </DialogTitle>
            <DialogDescription>
              Mermaidダイアグラムを生成するには、AIの設定が必要です。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              設定画面でOpenAI、Anthropic、またはGoogleのAPIキーを設定してください。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button onClick={handleGoToSettings}>
              <Settings className="h-4 w-4 mr-2" />
              設定画面へ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Mermaidダイアグラムを生成</DialogTitle>
          <DialogDescription>
            選択したテキストからダイアグラムを生成します。
          </DialogDescription>
        </DialogHeader>

        {/* 選択されたテキスト */}
        <div className="space-y-2">
          <Label>選択されたテキスト</Label>
          <div className="p-3 bg-muted rounded-md text-sm max-h-24 overflow-auto">
            {selectedText}
          </div>
        </div>

        {/* ダイアグラムタイプ選択 */}
        <div className="space-y-2">
          <Label>ダイアグラムタイプを選択（複数可）</Label>
          <div className="grid grid-cols-2 gap-2">
            {DIAGRAM_TYPES.map((type) => (
              <div
                key={type.id}
                className="flex items-start space-x-2 p-2 rounded border hover:bg-muted/50 cursor-pointer"
                onClick={() => handleTypeToggle(type.id)}
              >
                <Checkbox
                  id={type.id}
                  checked={selectedTypes.includes(type.id)}
                  onCheckedChange={() => handleTypeToggle(type.id)}
                />
                <div className="flex-1">
                  <Label
                    htmlFor={type.id}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {type.name}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {type.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 生成ボタン / 生成中表示 */}
        {status === "idle" && (
          <Button
            onClick={handleGenerate}
            disabled={selectedTypes.length === 0}
            className="w-full"
          >
            ダイアグラムを生成
          </Button>
        )}

        {status === "generating" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>生成中...</span>
          </div>
        )}

        {/* エラー表示 */}
        {status === "error" && error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-md">
            <p className="font-medium">エラーが発生しました</p>
            <p className="text-sm">{error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              className="mt-2"
            >
              再試行
            </Button>
          </div>
        )}

        {/* 結果プレビュー */}
        {status === "completed" && result && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>生成されたコード</Label>
              <pre className="p-3 bg-muted rounded-md text-sm overflow-auto max-h-32 font-mono">
                {result.code}
              </pre>
            </div>

            <div className="space-y-2">
              <Label>プレビュー</Label>
              {previewError ? (
                <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
                  {previewError}
                </div>
              ) : previewSvg ? (
                <div
                  className="p-4 bg-white dark:bg-gray-900 rounded-md border flex justify-center overflow-auto"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  プレビューを読み込み中...
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          {status === "completed" && result && (
            <>
              <Button variant="outline" onClick={handleGenerate}>
                再生成
              </Button>
              <Button onClick={handleInsert}>挿入</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
