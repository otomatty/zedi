import { useCallback, useState } from "react";
import type { AiModelAdmin } from "@/api/admin";
import { patchAiModelsBulk } from "@/api/admin";

interface UseAiModelsDragReorderArgs {
  models: AiModelAdmin[];
  setModels: React.Dispatch<React.SetStateAction<AiModelAdmin[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  isMountedRef: React.MutableRefObject<boolean>;
  load: (showLoading?: boolean) => Promise<void>;
}

export function useAiModelsDragReorder({
  models,
  setModels,
  setError,
  isMountedRef,
  load,
}: UseAiModelsDragReorderArgs) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleReorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const reordered = [...models];
      const [removed] = reordered.splice(fromIndex, 1);
      if (!removed) return;
      reordered.splice(toIndex, 0, removed);
      const updates = reordered.map((m, i) => ({ id: m.id, sortOrder: i }));
      setError(null);
      setModels(reordered.map((m, i) => ({ ...m, sortOrder: i })));
      try {
        await patchAiModelsBulk(updates);
      } catch (e) {
        if (!isMountedRef.current) return;
        void load(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [models, setModels, setError, isMountedRef, load],
  );

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("application/json", JSON.stringify({ id }));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toId: string) => {
      e.preventDefault();
      setDraggedId(null);
      setDragOverId(null);
      const fromId = e.dataTransfer.getData("text/plain");
      if (!fromId || fromId === toId) return;
      const fromIndex = models.findIndex((m) => m.id === fromId);
      const toIndex = models.findIndex((m) => m.id === toId);
      if (fromIndex === -1 || toIndex === -1) return;
      void handleReorder(fromIndex, toIndex);
    },
    [models, handleReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  return {
    draggedId,
    dragOverId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
