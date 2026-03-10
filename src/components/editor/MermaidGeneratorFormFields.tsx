import { Button } from "@zedi/ui";
import { Checkbox } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Loader2 } from "lucide-react";
import { DIAGRAM_TYPES } from "@/lib/mermaidGenerator";
import type { MermaidDiagramType } from "@/lib/mermaidGenerator";

interface MermaidGeneratorFormFieldsProps {
  selectedText: string;
  selectedTypes: MermaidDiagramType[];
  onTypeToggle: (type: MermaidDiagramType) => void;
  status: "idle" | "generating" | "completed" | "error";
  error: Error | null;
  onGenerate: () => void;
}

export function MermaidGeneratorFormFields({
  selectedText,
  selectedTypes,
  onTypeToggle,
  status,
  error,
  onGenerate,
}: MermaidGeneratorFormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>選択されたテキスト</Label>
        <div className="max-h-24 overflow-auto rounded-md bg-muted p-3 text-sm">{selectedText}</div>
      </div>

      <div className="space-y-2">
        <Label>ダイアグラムタイプを選択（複数可）</Label>
        <div className="grid grid-cols-2 gap-2">
          {DIAGRAM_TYPES.map((type) => (
            <div
              key={type.id}
              className="flex cursor-pointer items-start space-x-2 rounded border p-2 hover:bg-muted/50"
              onClick={() => onTypeToggle(type.id)}
            >
              <Checkbox
                id={type.id}
                checked={selectedTypes.includes(type.id)}
                onCheckedChange={() => onTypeToggle(type.id)}
              />
              <div className="flex-1">
                <Label htmlFor={type.id} className="cursor-pointer text-sm font-medium">
                  {type.name}
                </Label>
                <p className="text-xs text-muted-foreground">{type.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {status === "idle" && (
        <Button onClick={onGenerate} disabled={selectedTypes.length === 0} className="w-full">
          ダイアグラムを生成
        </Button>
      )}

      {status === "generating" && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>生成中...</span>
        </div>
      )}

      {status === "error" && error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          <p className="font-medium">エラーが発生しました</p>
          <p className="text-sm">{error.message}</p>
          <Button variant="outline" size="sm" onClick={onGenerate} className="mt-2">
            再試行
          </Button>
        </div>
      )}
    </>
  );
}
