import { Label } from "@zedi/ui";

interface MermaidGeneratorResultPreviewProps {
  code: string;
  previewSvg: string;
  previewError: string | null;
}

export function MermaidGeneratorResultPreview({
  code,
  previewSvg,
  previewError,
}: MermaidGeneratorResultPreviewProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>生成されたコード</Label>
        <pre className="max-h-32 overflow-auto rounded-md bg-muted p-3 font-mono text-sm">
          {code}
        </pre>
      </div>

      <div className="space-y-2">
        <Label>プレビュー</Label>
        {previewError ? (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {previewError}
          </div>
        ) : previewSvg ? (
          <div
            data-testid="preview-container"
            className="flex justify-center overflow-auto rounded-md border bg-white p-4 dark:bg-gray-900"
            dangerouslySetInnerHTML={{ __html: previewSvg }}
          />
        ) : (
          <div className="p-4 text-center text-muted-foreground">プレビューを読み込み中...</div>
        )}
      </div>
    </div>
  );
}
