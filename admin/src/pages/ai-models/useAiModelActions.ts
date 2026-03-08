import { useCallback } from "react";
import type { AiModelAdmin } from "@/api/admin";
import { patchAiModel } from "@/api/admin";

interface UseAiModelActionsArgs {
  setModels: React.Dispatch<React.SetStateAction<AiModelAdmin[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  isMountedRef: React.MutableRefObject<boolean>;
  originalModelsRef: React.MutableRefObject<AiModelAdmin[]>;
}

type ModelUpdates = Partial<
  Pick<
    AiModelAdmin,
    "displayName" | "tierRequired" | "inputCostUnits" | "outputCostUnits" | "isActive" | "sortOrder"
  >
>;

export function useAiModelActions({
  setModels,
  setError,
  isMountedRef,
  originalModelsRef,
}: UseAiModelActionsArgs) {
  const handleModelUpdate = useCallback(
    async (model: AiModelAdmin, updates: ModelUpdates) => {
      const rollbackUpdates = Object.fromEntries(
        Object.keys(updates).map((key) => [key, model[key as keyof ModelUpdates]]),
      ) as ModelUpdates;

      if (!isMountedRef.current) return;
      setError(null);
      setModels((prevModels) =>
        prevModels.map((x) => (x.id === model.id ? { ...x, ...updates } : x)),
      );
      try {
        await patchAiModel(model.id, updates);
        originalModelsRef.current = originalModelsRef.current.map((x) =>
          x.id === model.id ? { ...x, ...updates } : x,
        );
      } catch (e) {
        if (!isMountedRef.current) return;
        setModels((prevModels) =>
          prevModels.map((x) => (x.id === model.id ? { ...x, ...rollbackUpdates } : x)),
        );
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [setModels, setError, isMountedRef, originalModelsRef],
  );

  const handleToggleActive = useCallback(
    async (m: AiModelAdmin) => {
      const originalModel = originalModelsRef.current.find((om) => om.id === m.id);
      if (!originalModel) return;
      await handleModelUpdate(originalModel, { isActive: !m.isActive });
    },
    [handleModelUpdate, originalModelsRef],
  );

  const handleTierChange = useCallback(
    async (m: AiModelAdmin, tier: "free" | "pro") => {
      if (m.tierRequired === tier) return;
      const originalModel = originalModelsRef.current.find((om) => om.id === m.id);
      if (!originalModel) return;
      await handleModelUpdate(originalModel, { tierRequired: tier });
    },
    [handleModelUpdate, originalModelsRef],
  );

  return { handleModelUpdate, handleToggleActive, handleTierChange };
}
