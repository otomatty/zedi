import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@zedi/ui";
import { Button } from "@zedi/ui";
import { Settings, AlertCircle } from "lucide-react";

interface MermaidGeneratorNotConfiguredViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToSettings: () => void;
}

export function MermaidGeneratorNotConfiguredView({
  open,
  onOpenChange,
  onGoToSettings,
}: MermaidGeneratorNotConfiguredViewProps) {
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
          <Button onClick={onGoToSettings}>
            <Settings className="mr-2 h-4 w-4" />
            設定画面へ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
