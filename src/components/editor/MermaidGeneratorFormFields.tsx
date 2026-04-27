import { Button } from "@zedi/ui";
import { Checkbox } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Loader2 } from "lucide-react";
import { getMermaidDiagramTypes } from "@/lib/mermaidGenerator";
import type { MermaidDiagramType } from "@/lib/mermaidGenerator";
import { useTranslation } from "react-i18next";

interface MermaidGeneratorFormFieldsProps {
  selectedText: string;
  selectedTypes: MermaidDiagramType[];
  onTypeToggle: (type: MermaidDiagramType) => void;
  status: "idle" | "generating" | "completed" | "error";
  error: Error | null;
  onGenerate: () => void;
}

/**
 *
 */
export function MermaidGeneratorFormFields({
  selectedText,
  selectedTypes,
  onTypeToggle,
  status,
  error,
  onGenerate,
}: MermaidGeneratorFormFieldsProps) {
  const { t } = useTranslation();
  const diagramTypes = getMermaidDiagramTypes();
  return (
    <>
      <div className="space-y-2">
        <Label>{t("mermaid.form.selectedText")}</Label>
        <div className="bg-muted max-h-24 overflow-auto rounded-md p-3 text-sm">{selectedText}</div>
      </div>

      <div className="space-y-2">
        <Label>{t("mermaid.form.selectTypes")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {diagramTypes.map((type) => (
            <label
              key={type.id}
              htmlFor={type.id}
              className="hover:bg-muted/50 flex cursor-pointer items-start space-x-2 rounded border p-2"
            >
              <Checkbox
                id={type.id}
                checked={selectedTypes.includes(type.id)}
                onCheckedChange={() => onTypeToggle(type.id)}
                disabled={status !== "idle"}
              />
              <div className="flex-1">
                <span className="text-sm font-medium">{type.name}</span>
                <p className="text-muted-foreground text-xs">{type.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {status === "idle" && (
        <Button onClick={onGenerate} disabled={selectedTypes.length === 0} className="w-full">
          {t("mermaid.form.generate")}
        </Button>
      )}

      {status === "generating" && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>{t("mermaid.form.generating")}</span>
        </div>
      )}

      {status === "error" && error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-4">
          <p className="font-medium">{t("mermaid.form.errorTitle")}</p>
          <p className="text-sm">{error.message}</p>
          <Button variant="outline" size="sm" onClick={onGenerate} className="mt-2">
            {t("mermaid.form.retry")}
          </Button>
        </div>
      )}
    </>
  );
}
