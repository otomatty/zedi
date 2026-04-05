/**
 * Persisted custom workflow definitions (Issue #462).
 * 永続化するカスタムワークフロー定義（Issue #462）。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorkflowDefinition } from "@/lib/workflow/types";

interface WorkflowDefinitionsState {
  definitions: WorkflowDefinition[];
  /** Insert or replace by id. / id で挿入または置換 */
  upsertDefinition: (definition: WorkflowDefinition) => void;
  removeDefinition: (id: string) => void;
}

/**
 * Local persisted store for user-defined workflows.
 * ユーザー定義ワークフローをローカル永続化するストア。
 */
export const useWorkflowDefinitionsStore = create<WorkflowDefinitionsState>()(
  persist(
    (set, get) => ({
      definitions: [],
      upsertDefinition: (definition) => {
        const rest = get().definitions.filter((d) => d.id !== definition.id);
        const next = [...rest, definition].sort((a, b) => b.updatedAt - a.updatedAt);
        set({ definitions: next });
      },
      removeDefinition: (id) => {
        set({ definitions: get().definitions.filter((d) => d.id !== id) });
      },
    }),
    {
      name: "zedi-workflow-definitions",
      version: 1,
    },
  ),
);
