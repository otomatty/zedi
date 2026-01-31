import React from "react";
import {
  ArrowLeft,
  Trash2,
  MoreHorizontal,
  Download,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import Container from "@/components/layout/Container";
import { WikiGeneratorButton } from "../WikiGeneratorButton";
import { formatTimeAgo } from "@/lib/dateUtils";
import type { WikiGeneratorStatus } from "./types";
import type { StorageProviderInfo } from "@/types/storage";
import { StorageStatusHeader } from "../TiptapEditor/StorageStatusHeader";

interface PageEditorHeaderProps {
  title: string;
  onTitleChange: (value: string) => void;
  lastSaved: number | null;
  hasContent: boolean;
  wikiStatus: WikiGeneratorStatus;
  errorMessage: string | null;
  currentStorageProvider?: StorageProviderInfo;
  isStorageConfigured: boolean;
  isStorageLoading: boolean;
  onGoToStorageSettings: () => void;
  onBack: () => void;
  onDelete: () => void;
  onExportMarkdown: () => void;
  onCopyMarkdown: () => void;
  onGenerateWiki: () => void;
}

/**
 * Header component for PageEditor
 * Contains title input, action buttons, and dropdown menu
 */
export const PageEditorHeader: React.FC<PageEditorHeaderProps> = ({
  title,
  onTitleChange,
  lastSaved,
  hasContent,
  wikiStatus,
  errorMessage,
  currentStorageProvider,
  isStorageConfigured,
  isStorageLoading,
  onGoToStorageSettings,
  onBack,
  onDelete,
  onExportMarkdown,
  onCopyMarkdown,
  onGenerateWiki,
}) => {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container className="flex h-14 items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1 min-w-0">
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="ページタイトル"
            className={`border-0 bg-transparent text-xl font-medium focus-visible:ring-0 px-0 h-auto py-1 ${
              errorMessage ? "text-destructive" : ""
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Wiki Generator Button - タイトルがあり本文が空の場合のみ表示 */}
          <WikiGeneratorButton
            title={title}
            hasContent={hasContent}
            onGenerate={onGenerateWiki}
            status={wikiStatus}
          />
          <StorageStatusHeader
            currentStorageProvider={currentStorageProvider}
            isStorageConfigured={isStorageConfigured}
            isStorageLoading={isStorageLoading}
            onGoToStorageSettings={onGoToStorageSettings}
            className="shrink-0"
          />
          {lastSaved && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {formatTimeAgo(lastSaved)}に保存
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportMarkdown}>
                <Download className="mr-2 h-4 w-4" />
                Markdownでエクスポート
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyMarkdown}>
                <Copy className="mr-2 h-4 w-4" />
                Markdownをコピー
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Container>
    </header>
  );
};
