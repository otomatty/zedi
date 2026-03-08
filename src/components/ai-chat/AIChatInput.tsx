import { useMemo } from "react";
import { Send, Square, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReferencedPage } from "../../types/aiChat";
import { useAIChatStore } from "../../stores/aiChatStore";
import { AIChatModelSelector } from "./AIChatModelSelector";
import { useAIChatInput } from "./useAIChatInput";
import { cn } from "@zedi/ui/lib/utils";

interface AIChatInputProps {
  onSendMessage: (message: string, referencedPages: ReferencedPage[]) => void;
  onStopStreaming: () => void;
}

export function AIChatInput({ onSendMessage, onStopStreaming }: AIChatInputProps) {
  const { t } = useTranslation();
  const {
    editorRef,
    dropdownRef,
    isEmpty,
    textLength,
    isStreaming,
    isDraggingOver,
    placeholder,
    showMentionDropdown,
    mentionCandidates,
    mentionIndex,
    setMentionIndex,
    selectMentionPage,
    handleEditorInput,
    handleSubmit,
    handleKeyDown,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useAIChatInput({ onSendMessage });

  const { selectedModel } = useAIChatStore();
  const estimatedCU = useMemo(() => {
    if (!selectedModel?.inputCostUnits || textLength === 0) return null;
    const estimatedTokens = Math.ceil(textLength / 4);
    return Math.max(1, Math.round((estimatedTokens / 1000) * selectedModel.inputCostUnits));
  }, [textLength, selectedModel]);

  return (
    <div className="relative">
      {showMentionDropdown && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[240px] overflow-hidden overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {mentionCandidates.map((page, idx) => (
            <button
              key={page.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                idx === mentionIndex && "bg-accent",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                selectMentionPage({ id: page.id, title: page.title || "無題のページ" });
              }}
              onMouseEnter={() => setMentionIndex(idx)}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{page.title || "無題のページ"}</span>
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={cn(
          "relative rounded-lg border bg-background p-2 transition-all focus-within:ring-1 focus-within:ring-primary",
          isDraggingOver && "border-primary bg-primary/5 ring-2 ring-primary",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="relative min-w-0">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-placeholder={placeholder}
            onInput={handleEditorInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="max-h-[120px] min-h-[24px] overflow-y-auto whitespace-pre-wrap bg-transparent p-1 text-sm outline-none [word-break:break-word]"
          />
          {isEmpty && (
            <div className="pointer-events-none absolute inset-0 truncate p-1 text-sm text-muted-foreground">
              {placeholder}
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between border-t border-border/50 pt-1">
          <div className="flex items-center gap-2">
            <AIChatModelSelector />
            {estimatedCU !== null && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {t("aiChat.modelSelector.estimatedCost", { cost: estimatedCU })}
              </span>
            )}
          </div>
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStreaming}
              className="shrink-0 rounded-md bg-destructive p-1.5 text-destructive-foreground transition-colors hover:bg-destructive/90"
              title={t("aiChat.actions.stop")}
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isEmpty}
              className="shrink-0 rounded-md bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              title={t("aiChat.actions.send")}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/5">
          <span className="text-xs font-medium text-primary">
            {t("aiChat.referencedPages.dropHint")}
          </span>
        </div>
      )}
    </div>
  );
}
