import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@zedi/ui";
import { Button } from "@zedi/ui";
import { useMermaidGenerator } from "@/hooks/useMermaidGenerator";
import { MermaidDiagramType } from "@/lib/mermaidGenerator";
import { MermaidGeneratorNotConfiguredView } from "./MermaidGeneratorNotConfiguredView";
import { MermaidGeneratorFormFields } from "./MermaidGeneratorFormFields";
import { MermaidGeneratorResultPreview } from "./MermaidGeneratorResultPreview";
import { useTranslation } from "react-i18next";

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

/**
 * Mermaid ダイアグラム生成ダイアログ。
 * / Dialog for generating Mermaid diagrams from selected text.
 */
const MermaidGeneratorDialog: React.FC<MermaidGeneratorDialogProps> = ({
  open,
  onOpenChange,
  selectedText,
  onInsert,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, result, error, isAIConfigured, generate, reset, checkAIConfigured } =
    useMermaidGenerator();

  const [selectedTypes, setSelectedTypes] = useState<MermaidDiagramType[]>(["flowchart"]);
  const [previewSvg, setPreviewSvg] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      checkAIConfigured();
      reset();
      queueMicrotask(() => {
        setPreviewSvg("");
        setPreviewError(null);
      });
    }
  }, [open, checkAIConfigured, reset]);

  useEffect(() => {
    const renderPreview = async () => {
      if (result?.code) {
        try {
          const mermaid = await getMermaid();
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
          await mermaid.parse(result.code);
          const id = `preview-${Math.random().toString(36).slice(2, 11)}`;
          const { svg } = await mermaid.render(id, result.code);
          setPreviewSvg(svg);
          setPreviewError(null);
        } catch (err) {
          setPreviewError(err instanceof Error ? err.message : t("mermaid.preview.parseError"));
          setPreviewSvg("");
        }
      }
    };
    renderPreview();
  }, [result, t]);

  const handleTypeToggle = (type: MermaidDiagramType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
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
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const params = new URLSearchParams({ section: "ai", returnTo });
    navigate(`/settings?${params.toString()}`);
  };

  if (isAIConfigured === false) {
    return (
      <MermaidGeneratorNotConfiguredView
        open={open}
        onOpenChange={onOpenChange}
        onGoToSettings={handleGoToSettings}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle>{t("mermaid.dialog.title")}</DialogTitle>
          <DialogDescription>{t("mermaid.dialog.description")}</DialogDescription>
        </DialogHeader>

        <MermaidGeneratorFormFields
          selectedText={selectedText}
          selectedTypes={selectedTypes}
          onTypeToggle={handleTypeToggle}
          status={status}
          error={error}
          onGenerate={handleGenerate}
        />

        {status === "completed" && result && (
          <MermaidGeneratorResultPreview
            code={result.code}
            previewSvg={previewSvg}
            previewError={previewError}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("mermaid.dialog.cancel")}
          </Button>
          {status === "completed" && result && (
            <>
              <Button variant="outline" onClick={handleGenerate}>
                {t("mermaid.dialog.regenerate")}
              </Button>
              <Button onClick={handleInsert}>{t("mermaid.dialog.insert")}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
