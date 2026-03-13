import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@zedi/ui";
import { Button } from "@zedi/ui";
import { Textarea } from "@zedi/ui";

interface MathEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLatex: string;
  isBlock: boolean;
  onSave: (latex: string) => void;
}

export const MathEditDialog: React.FC<MathEditDialogProps> = ({
  open,
  onOpenChange,
  initialLatex,
  isBlock,
  onSave,
}) => {
  const [latex, setLatex] = useState(initialLatex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => setLatex(initialLatex));
      // Focus textarea after dialog opens
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
    }
  }, [open, initialLatex]);

  const handleSave = () => {
    onSave(latex);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isBlock ? "ブロック数式を編集" : "インライン数式を編集"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            ref={textareaRef}
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="LaTeX を入力（例: E = mc^2）"
            className="min-h-[120px] font-mono text-sm"
            rows={isBlock ? 6 : 3}
          />
          <p className="text-xs text-muted-foreground">
            LaTeX 記法で数式を入力してください。Ctrl+Enter で保存します。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
