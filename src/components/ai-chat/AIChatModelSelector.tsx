import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAIChatStore } from "../../stores/aiChatStore";
import { fetchServerModels } from "../../lib/aiService";
import { getSonnetBaseline, formatCostMultiplierLabel } from "../../lib/aiCostUtils";
import { loadAISettings } from "../../lib/aiSettings";
import { isTauriDesktop } from "../../lib/platform";
import type { AIModel, AIInteractionMode, AIProviderType } from "../../types/ai";
import { getInteractionMode } from "../../types/ai";
import { cn } from "@zedi/ui";

interface DisplayModel {
  id: string;
  provider: AIProviderType;
  modelId: string;
  displayName: string;
  inputCostUnits?: number;
  outputCostUnits?: number;
}

/**
 * Resolves which Claude Code model to select after loading the list.
 * 一覧取得後に選ぶ Claude Code モデルを解決する。
 */
function resolveClaudeInitialSelection(
  claudeModels: DisplayModel[],
  current: { id: string; provider: AIProviderType } | null,
  savedModelId: string | undefined,
): DisplayModel | undefined {
  if (claudeModels.length === 0) return undefined;
  const matchedCurrent =
    current?.provider === "claude-code" ? claudeModels.find((m) => m.id === current.id) : undefined;
  if (matchedCurrent) return undefined;
  const matchedSaved = savedModelId ? claudeModels.find((m) => m.id === savedModelId) : undefined;
  return matchedSaved ?? claudeModels[0];
}

/**
 * Resolves which server model to select when the current store id is not in the list.
 * ストアの選択が一覧に無いときに選ぶサーバーモデルを解決する。
 */
function resolveServerInitialSelection(
  available: AIModel[],
  current: { id: string } | null,
  savedModelId: string | undefined,
): AIModel | undefined {
  if (available.length === 0) return undefined;
  const matchedCurrent = current ? available.find((m) => m.id === current.id) : undefined;
  if (matchedCurrent) return undefined;
  const matched = savedModelId ? available.find((m) => m.id === savedModelId) : null;
  return matched ?? available[0];
}

/**
 * Chat-panel model selector. Behaviour varies by interaction mode:
 * - default: shows all available server models
 * - user_api_key: filters to the configured provider only
 * - claude_code: fetches available Claude models from the sidecar
 *
 * チャットパネルのモデルセレクター。利用モードに応じて動作が変わる。
 */
export function AIChatModelSelector() {
  const { t } = useTranslation();
  const { setSelectedModel, isStreaming } = useAIChatStore();
  const [models, setModels] = useState<DisplayModel[]>([]);
  const [serverAIModels, setServerAIModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AIInteractionMode>("default");
  const containerRef = useRef<HTMLDivElement>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await loadAISettings();
      const currentMode = settings ? getInteractionMode(settings) : "default";
      setMode(currentMode);

      if (currentMode === "claude_code") {
        let claudeModels: DisplayModel[] = [];
        if (isTauriDesktop()) {
          try {
            const { claudeListModels } = await import("@/lib/claudeCode/bridge");
            const result = await claudeListModels();
            claudeModels = result.models.map((m) => ({
              id: `claude-code:${m.value}`,
              provider: "claude-code",
              modelId: m.value,
              displayName: m.displayName,
            }));
          } catch {
            claudeModels = [
              {
                id: "claude-code:claude-sonnet-4-6",
                provider: "claude-code",
                modelId: "claude-sonnet-4-6",
                displayName: "Claude Sonnet 4.6",
              },
            ];
          }
        }
        setModels(claudeModels);
        setServerAIModels([]);

        const current = useAIChatStore.getState().selectedModel;
        const initial = resolveClaudeInitialSelection(claudeModels, current, settings?.modelId);
        if (initial) {
          setSelectedModel({
            id: initial.id,
            provider: "claude-code",
            model: initial.modelId,
            displayName: initial.displayName,
          });
        }
        return;
      }

      const { models: serverModels } = await fetchServerModels();
      let available = serverModels.filter((m) => m.available);
      if (currentMode === "user_api_key" && settings) {
        available = available.filter((m) => m.provider === settings.provider);
      }
      setServerAIModels(available);
      setModels(
        available.map((m) => ({
          id: m.id,
          provider: m.provider,
          modelId: m.modelId,
          displayName: m.displayName,
          inputCostUnits: m.inputCostUnits,
          outputCostUnits: m.outputCostUnits,
        })),
      );

      const current = useAIChatStore.getState().selectedModel;
      const initial = resolveServerInitialSelection(available, current, settings?.modelId);
      if (initial) {
        setSelectedModel({
          id: initial.id,
          provider: initial.provider,
          model: initial.modelId,
          displayName: initial.displayName,
          inputCostUnits: initial.inputCostUnits,
          outputCostUnits: initial.outputCostUnits,
        });
      }
    } catch {
      // fallback: use settings model
    } finally {
      setLoading(false);
    }
  }, [setSelectedModel]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

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
    (model: DisplayModel) => {
      setSelectedModel({
        id: model.id,
        provider: model.provider,
        model: model.modelId,
        displayName: model.displayName,
        inputCostUnits: model.inputCostUnits,
        outputCostUnits: model.outputCostUnits,
      });
      setOpen(false);
    },
    [setSelectedModel],
  );

  const selectedModel = useAIChatStore((s) => s.selectedModel);
  const displayLabel = selectedModel?.displayName ?? t("aiChat.modelSelector.select");
  const sonnetBaseline = getSonnetBaseline(serverAIModels);
  const showCost = mode !== "claude_code";

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
        <div className="border-border bg-popover absolute bottom-full left-0 z-50 mb-1 max-h-[280px] max-w-[320px] min-w-[240px] overflow-hidden overflow-y-auto rounded-lg border shadow-lg">
          {models.map((model) => {
            const isSelected = selectedModel?.id === model.id;
            const costLabel =
              showCost && model.inputCostUnits != null
                ? formatCostMultiplierLabel(model.inputCostUnits, sonnetBaseline)
                : null;
            const isCheaperOrBaseline =
              model.inputCostUnits != null && model.inputCostUnits <= sonnetBaseline;
            return (
              <button
                key={model.id}
                type="button"
                className={cn(
                  "hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                  isSelected && "bg-accent/50",
                )}
                onClick={() => handleSelect(model)}
              >
                <span className="truncate">{model.displayName}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {costLabel && (
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 text-[10px] tabular-nums",
                        isCheaperOrBaseline
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {costLabel}
                    </span>
                  )}
                  {isSelected && <Check className="text-primary h-3.5 w-3.5 shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
