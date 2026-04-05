/**
 * Draft editing and local persistence for workflow definitions (Issue #462).
 * ワークフロー定義のドラフト編集とローカル永続化（Issue #462）。
 */

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { newWorkflowId } from "@/lib/workflow/newWorkflowId";
import { parseWorkflowDefinitionImport } from "@/lib/workflow/parseWorkflowDefinitionImport";
import type { WorkflowDefinition, WorkflowStepDefinition } from "@/lib/workflow/types";
import {
  WORKFLOW_TEMPLATE_NAME_KEYS,
  instantiateWorkflowTemplate,
  type WorkflowTemplateId,
} from "@/lib/workflow/templates";
import { useWorkflowDefinitionsStore } from "@/stores/workflowDefinitionsStore";

function emptyDraft(): WorkflowDefinition {
  const now = Date.now();
  return {
    id: newWorkflowId(),
    name: "",
    steps: [{ id: newWorkflowId(), title: "", instruction: "" }],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Draft state, templates, import/export, and saved-definition list.
 * ドラフト状態・テンプレート・インポート/エクスポート・保存一覧。
 */
export function useWorkflowDraft() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const definitions = useWorkflowDefinitionsStore((s) => s.definitions);
  const upsertDefinition = useWorkflowDefinitionsStore((s) => s.upsertDefinition);
  const removeDefinition = useWorkflowDefinitionsStore((s) => s.removeDefinition);

  const [draft, setDraft] = useState<WorkflowDefinition>(() => emptyDraft());
  const [selectedSavedId, setSelectedSavedId] = useState<string | "">("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const addStep = useCallback(() => {
    setDraft((d) => ({
      ...d,
      steps: [...d.steps, { id: newWorkflowId(), title: "", instruction: "" }],
      updatedAt: Date.now(),
    }));
  }, []);

  const removeStep = useCallback((index: number) => {
    setDraft((d) => ({
      ...d,
      steps: d.steps.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    }));
  }, []);

  const updateStep = useCallback((index: number, patch: Partial<WorkflowStepDefinition>) => {
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      updatedAt: Date.now(),
    }));
  }, []);

  const loadTemplate = useCallback(
    (tid: WorkflowTemplateId) => {
      const name = t(WORKFLOW_TEMPLATE_NAME_KEYS[tid]);
      setDraft(instantiateWorkflowTemplate(tid, name));
      setSelectedSavedId("");
    },
    [t],
  );

  const saveCustom = useCallback(() => {
    if (!draft.name.trim()) {
      toast({ title: t("aiChat.workflow.nameRequired"), variant: "destructive" });
      return;
    }
    const now = Date.now();
    upsertDefinition({ ...draft, updatedAt: now });
    toast({ title: t("aiChat.workflow.saved") });
  }, [draft, t, toast, upsertDefinition]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.name.trim() || "workflow"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [draft]);

  const onImportFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as unknown;
          const { name, steps } = parseWorkflowDefinitionImport(parsed);
          const now = Date.now();
          setDraft({
            id: newWorkflowId(),
            name,
            steps,
            createdAt: now,
            updatedAt: now,
          });
          setSelectedSavedId("");
          toast({ title: t("aiChat.workflow.imported") });
        } catch {
          toast({ title: t("aiChat.workflow.importFailed"), variant: "destructive" });
        }
      };
      reader.readAsText(file);
    },
    [t, toast],
  );

  const loadSaved = useCallback(
    (id: string) => {
      const found = definitions.find((d) => d.id === id);
      if (found) {
        setDraft({ ...found });
        setSelectedSavedId(id);
      }
    },
    [definitions],
  );

  const deleteSaved = useCallback(() => {
    if (!selectedSavedId) return;
    removeDefinition(selectedSavedId);
    setSelectedSavedId("");
    toast({ title: t("aiChat.workflow.deleted") });
  }, [removeDefinition, selectedSavedId, t, toast]);

  return {
    t,
    draft,
    setDraft,
    definitions,
    selectedSavedId,
    importInputRef,
    addStep,
    removeStep,
    updateStep,
    loadTemplate,
    saveCustom,
    exportJson,
    onImportFile,
    loadSaved,
    deleteSaved,
  };
}
