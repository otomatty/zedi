import { useMemo } from "react";
import { Send, Square, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReferencedPage } from "../../types/aiChat";
import { useAIChatStore } from "../../stores/aiChatStore";
import { AIChatModelSelector } from "./AIChatModelSelector";
import { useAIChatInput } from "./useAIChatInput";
import { cn } from "@zedi/ui";

interface AIChatInputProps {
  onSendMessage: (message: string, referencedPages: ReferencedPage[]) => void;
  onStopStreaming: () => void;
  /** Overrides default placeholder. / 既定プレースホルダーを上書き */
  placeholderOverride?: string;
  /** Extra classes on the form (e.g. landing large input). / フォームへの追加クラス */
  formClassName?: string;
  /** Extra classes on the contenteditable (e.g. min-height for landing). / contenteditable への追加クラス */
  editorClassName?: string;
  /** Classes for the empty-state placeholder overlay (match editor font size). / 空状態プレースホルダー（フォントサイズ合わせ） */
  emptyOverlayClassName?: string;
  /** See {@link useAIChatInput} prefill. / ブランチ分岐時のプリフィル */
  prefillText?: string;
  /** See {@link useAIChatInput} prefillNonce. / プリフィル適用のたびにインクリメント */
  prefillNonce?: number;
  /** See {@link useAIChatInput} focusEditorNonce. / フォーカスのみ（アシスタント分岐） */
  focusEditorNonce?: number;
}

/**
 *
 */
export function AIChatInput({
  onSendMessage,
  onStopStreaming,
  placeholderOverride,
  formClassName,
  editorClassName,
  emptyOverlayClassName,
  prefillText,
  prefillNonce,
  focusEditorNonce,
}: AIChatInputProps) {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
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
  } = useAIChatInput({
    onSendMessage,
    placeholderOverride,
    prefillText,
    prefillNonce,
    focusEditorNonce,
  });

  /**
   *
   */
  const { selectedModel } = useAIChatStore();
  /**
   *
   */
  const estimatedCU = useMemo(() => {
    if (!selectedModel?.inputCostUnits || textLength === 0) return null;
    /**
     *
     */
    const estimatedTokens = Math.ceil(textLength / 4);
    return Math.max(1, Math.round((estimatedTokens / 1000) * selectedModel.inputCostUnits));
  }, [textLength, selectedModel]);

  return (
    <div className="relative">
      {showMentionDropdown && (
        <div
          ref={dropdownRef}
          className="border-border bg-popover absolute right-0 bottom-full left-0 z-50 mb-1 max-h-[240px] overflow-hidden overflow-y-auto rounded-lg border shadow-lg"
        >
          {mentionCandidates.map((page, idx) => (
            <button
              key={page.id}
              type="button"
              className={cn(
                "hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                idx === mentionIndex && "bg-accent",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                selectMentionPage({ id: page.id, title: page.title || "無題のページ" });
              }}
              onMouseEnter={() => setMentionIndex(idx)}
            >
              <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="truncate">{page.title || "無題のページ"}</span>
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={cn(
          "bg-background focus-within:ring-primary relative rounded-lg border p-2 transition-all focus-within:ring-1",
          isDraggingOver && "border-primary bg-primary/5 ring-primary ring-2",
          formClassName,
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
            className={cn(
              "max-h-[120px] min-h-[24px] overflow-y-auto bg-transparent p-1 text-sm [word-break:break-word] whitespace-pre-wrap outline-none",
              editorClassName,
            )}
          />
          {isEmpty && (
            <div
              className={cn(
                "text-muted-foreground pointer-events-none absolute inset-0 truncate p-1 text-sm",
                emptyOverlayClassName,
              )}
            >
              {placeholder}
            </div>
          )}
        </div>

        <div className="border-border/50 mt-1 flex items-center justify-between border-t pt-1">
          <div className="flex items-center gap-2">
            <AIChatModelSelector />
            {estimatedCU !== null && (
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {t("aiChat.modelSelector.estimatedCost", { cost: estimatedCU })}
              </span>
            )}
          </div>
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStreaming}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 shrink-0 rounded-md p-1.5 transition-colors"
              title={t("aiChat.actions.stop")}
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isEmpty}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title={t("aiChat.actions.send")}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {isDraggingOver && (
        <div className="bg-primary/5 pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg">
          <span className="text-primary text-xs font-medium">
            {t("aiChat.referencedPages.dropHint")}
          </span>
        </div>
      )}
    </div>
  );
}
