import React, { useEffect, useRef, useState } from "react";
import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Check, X, Maximize2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Dynamic import for mermaid to avoid initialization issues
let mermaidInstance: typeof import("mermaid").default | null = null;
let mermaidInitialized = false;

async function getMermaid() {
  if (!mermaidInstance) {
    const { default: mermaid } = await import("mermaid");
    mermaidInstance = mermaid;
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        fontFamily: "inherit",
      });
      mermaidInitialized = true;
    }
  }
  return mermaidInstance;
}

export const MermaidNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editCode, setEditCode] = useState(node.attrs.code);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const code = node.attrs.code as string;

  // Mermaidダイアグラムをレンダリング
  useEffect(() => {
    const renderDiagram = async () => {
      if (!code) {
        setError("ダイアグラムコードが空です");
        return;
      }

      try {
        const mermaid = await getMermaid();

        // コードを検証
        await mermaid.parse(code);
        setError(null);

        // ユニークなIDを生成
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

        // SVGをレンダリング
        const { svg } = await mermaid.render(id, code);
        setSvgContent(svg);
      } catch (err) {
        console.error("Mermaid render error:", err);
        setError(err instanceof Error ? err.message : "レンダリングエラー");
        setSvgContent("");
      }
    };

    renderDiagram();
  }, [code]);

  const handleSave = () => {
    updateAttributes({ code: editCode });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditCode(code);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <NodeViewWrapper className="mermaid-node">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Mermaidコードを編集</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleSave}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Textarea
            value={editCode}
            onChange={(e) => setEditCode(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            placeholder="graph TD&#10;    A[Start] --> B[End]"
          />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="mermaid-node">
      <div
        className={`group relative rounded-lg border bg-white p-4 dark:bg-gray-900 ${
          selected ? "ring-2 ring-primary" : ""
        }`}
      >
        {/* ツールバー */}
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="sm" variant="ghost" onClick={() => setIsFullscreen(true)} title="拡大表示">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} title="編集">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={deleteNode}
            title="削除"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* ダイアグラム表示 */}
        {error ? (
          <div className="rounded bg-destructive/10 p-4 text-sm text-destructive">
            <p className="mb-1 font-medium">Mermaidエラー</p>
            <pre className="whitespace-pre-wrap text-xs">{error}</pre>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="mt-2">
              コードを修正
            </Button>
          </div>
        ) : svgContent ? (
          <div
            ref={containerRef}
            className="mermaid-diagram flex justify-center overflow-auto"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            読み込み中...
          </div>
        )}

        {/* フルスクリーンダイアログ */}
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-auto">
            <DialogHeader>
              <DialogTitle>ダイアグラム</DialogTitle>
            </DialogHeader>
            <div
              className="flex justify-center p-4"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </NodeViewWrapper>
  );
};
