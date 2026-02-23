import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAIChatStore } from "../../stores/aiChatStore";
import { fetchServerModels } from "../../lib/aiService";
import { loadAISettings } from "../../lib/aiSettings";
import type { AIModel } from "../../types/ai";
import { cn } from "../../lib/utils";

export function AIChatModelSelector() {
  const { t } = useTranslation();
  const { selectedModel, setSelectedModel, isStreaming } = useAIChatStore();
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // モデル一覧をロード
  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const { models: serverModels } = await fetchServerModels();
      const available = serverModels.filter((m) => m.available);
      setModels(available);

      // 初回: selectedModel がまだ null なら設定画面のモデル or デフォルトを選択
      if (!selectedModel && available.length > 0) {
        const settings = await loadAISettings();
        const savedModelId = settings?.modelId;
        const matched = savedModelId ? available.find((m) => m.id === savedModelId) : null;
        const first = available[0];
        const initial = matched ?? first;
        if (initial) {
          setSelectedModel({
            id: initial.id,
            provider: initial.provider,
            model: initial.modelId,
            displayName: initial.displayName,
          });
        }
      }
    } catch {
      // フォールバック: 設定画面のモデルを使用
    } finally {
      setLoading(false);
    }
  }, [selectedModel, setSelectedModel]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // 外部クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = useCallback(
    (model: AIModel) => {
      setSelectedModel({
        id: model.id,
        provider: model.provider,
        model: model.modelId,
        displayName: model.displayName,
      });
      setOpen(false);
    },
    [setSelectedModel],
  );

  const displayLabel = selectedModel?.displayName ?? t("aiChat.modelSelector.select");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={isStreaming || loading}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
          "text-muted-foreground hover:bg-muted hover:text-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "bg-muted text-foreground",
        )}
        title={t("aiChat.modelSelector.tooltip")}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <span className="max-w-[160px] truncate">{displayLabel}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </>
        )}
      </button>

      {open && models.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-1 max-h-[280px] min-w-[200px] max-w-[280px] overflow-hidden overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {models.map((model) => {
            const isSelected = selectedModel?.id === model.id;
            return (
              <button
                key={model.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  isSelected && "bg-accent/50",
                )}
                onClick={() => handleSelect(model)}
              >
                <span className="truncate">{model.displayName}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
