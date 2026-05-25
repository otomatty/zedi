import { useCallback, useRef } from "react";
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
    | "displayName"
    | "tierRequired"
    | "inputCostUnits"
    | "outputCostUnits"
    | "isActive"
    | "isSystemDefault"
    | "sortOrder"
  >
>;

export function useAiModelActions({
  setModels,
  setError,
  isMountedRef,
  originalModelsRef,
}: UseAiModelActionsArgs) {
  const settingSystemDefaultRef = useRef(false);

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
      const nextActive = !m.isActive;
      await handleModelUpdate(originalModel, {
        isActive: nextActive,
        ...(nextActive === false && m.isSystemDefault ? { isSystemDefault: false } : {}),
      });
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

  const handleSetSystemDefault = useCallback(
    async (m: AiModelAdmin) => {
      if (settingSystemDefaultRef.current || m.isSystemDefault || !m.isActive) return;
      const originalModel = originalModelsRef.current.find((om) => om.id === m.id);
      if (!originalModel) return;

      if (!isMountedRef.current) return;
      settingSystemDefaultRef.current = true;
      setError(null);
      setModels((prevModels) =>
        prevModels.map((x) => ({
          ...x,
          isSystemDefault: x.id === m.id,
        })),
      );
      try {
        await patchAiModel(m.id, { isSystemDefault: true });
        originalModelsRef.current = originalModelsRef.current.map((x) => ({
          ...x,
          isSystemDefault: x.id === m.id,
        }));
      } catch (e) {
        if (!isMountedRef.current) return;
        setModels(originalModelsRef.current);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        settingSystemDefaultRef.current = false;
      }
    },
    [setModels, setError, isMountedRef, originalModelsRef],
  );

  return { handleModelUpdate, handleToggleActive, handleTierChange, handleSetSystemDefault };
}
