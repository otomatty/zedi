import React, { useState } from "react";
import { GitBranch, Image as ImageIcon, Menu, Send } from "lucide-react";
import Container from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

interface EditorBottomToolbarProps {
  isReadOnly: boolean;
  showDiagramAction: boolean;
  onInsertImage: () => void;
  onGenerateDiagram: () => void;
}

export const EditorBottomToolbar: React.FC<EditorBottomToolbarProps> = ({
  isReadOnly,
  showDiagramAction,
  onInsertImage,
  onGenerateDiagram,
}) => {
  const [chatValue, setChatValue] = useState("");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container className="flex h-14 items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Input
              value={chatValue}
              onChange={(event) => setChatValue(event.target.value)}
              placeholder="AIに質問・追記・検索"
              aria-label="AIチャットバー"
              className="h-9"
            />
            <Button type="button" variant="ghost" size="icon" className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onInsertImage}
            disabled={isReadOnly}
          >
            <ImageIcon className="h-4 w-4 mr-1" />
            画像
          </Button>
          {showDiagramAction && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onGenerateDiagram}
              disabled={isReadOnly}
            >
              <GitBranch className="h-4 w-4 mr-1" />
              ダイアグラム
            </Button>
          )}
        </div>

        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onInsertImage} disabled={isReadOnly}>
                <ImageIcon className="h-4 w-4 mr-2" />
                画像を挿入
              </DropdownMenuItem>
              {showDiagramAction && (
                <DropdownMenuItem
                  onClick={onGenerateDiagram}
                  disabled={isReadOnly}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  ダイアグラム生成
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Container>
    </div>
  );
};
