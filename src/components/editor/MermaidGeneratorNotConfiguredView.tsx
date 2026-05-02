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
import { useTranslation } from "react-i18next";

interface MermaidGeneratorNotConfiguredViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToSettings: () => void;
}

/**
 * AI 未設定時の Mermaid 生成ダイアログ本文。
 * / Mermaid generator dialog when AI is not configured.
 */
export function MermaidGeneratorNotConfiguredView({
  open,
  onOpenChange,
  onGoToSettings,
}: MermaidGeneratorNotConfiguredViewProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            {t("editor.slash.mermaid.notConfigured.title")}
          </DialogTitle>
          <DialogDescription>
            {t("editor.slash.mermaid.notConfigured.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-muted-foreground text-sm">
            {t("editor.slash.mermaid.notConfigured.hint")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onGoToSettings}>
            <Settings className="mr-2 h-4 w-4" />
            {t("common.goToSettings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
