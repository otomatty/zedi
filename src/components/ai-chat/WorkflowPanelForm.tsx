/**
 * Form layout for the workflow panel (Issue #462).
 * ワークフローパネルのフォームレイアウト（Issue #462）。
 */

import { Button, ScrollArea } from "@zedi/ui";
import { ListChecks, Pause, Play, Square } from "lucide-react";
import { isTauriDesktop } from "@/lib/platform";
import { WorkflowPanelMetaSection } from "./WorkflowPanelMetaSection";
import { WorkflowPanelStepsAndProgress } from "./WorkflowPanelStepsAndProgress";
import type { WorkflowPanelFormProps } from "./workflowPanelTypes";

export type { WorkflowPanelFormProps } from "./workflowPanelTypes";

/**
 * Renders workflow name, templates, steps, progress, and run controls.
 * ワークフロー名・テンプレート・ステップ・進捗・実行操作を描画する。
 */
export function WorkflowPanelForm(props: WorkflowPanelFormProps) {
  const {
    t,
    draft,
    setDraft,
    definitions,
    selectedSavedId,
    progress,
    activeRunSteps,
    pausedState,
    importInputRef,
    isEditor,
    running,
    runExecution,
    handlePause,
    handleStop,
    addStep,
    removeStep,
    updateStep,
    loadTemplate,
    saveCustom,
    exportJson,
    onImportFile,
    loadSaved,
    deleteSaved,
  } = props;

  const canRunWorkflow = isTauriDesktop() && isEditor;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <ListChecks className="h-4 w-4 shrink-0" />
        <span>{t("aiChat.workflow.subtitle")}</span>
      </div>

      {!isTauriDesktop() && (
        <p className="text-destructive text-xs">{t("aiChat.workflow.desktopOnly")}</p>
      )}

      <ScrollArea className="min-h-0 flex-1 pr-2">
        <div className="flex flex-col gap-3 pb-2">
          <WorkflowPanelMetaSection
            t={t}
            draft={draft}
            setDraft={setDraft}
            definitions={definitions}
            selectedSavedId={selectedSavedId}
            importInputRef={importInputRef}
            running={running}
            loadTemplate={loadTemplate}
            saveCustom={saveCustom}
            exportJson={exportJson}
            onImportFile={onImportFile}
            loadSaved={loadSaved}
            deleteSaved={deleteSaved}
          />
          <WorkflowPanelStepsAndProgress
            t={t}
            draft={draft}
            running={running}
            progress={progress}
            activeRunSteps={activeRunSteps}
            addStep={addStep}
            removeStep={removeStep}
            updateStep={updateStep}
          />
        </div>
      </ScrollArea>

      <div className="border-border flex flex-wrap gap-2 border-t pt-2">
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          disabled={running || !canRunWorkflow}
          onClick={() => void runExecution("fresh")}
        >
          <Play className="mr-1 h-3 w-3" />
          {t("aiChat.workflow.run")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 text-xs"
          disabled={!running}
          onClick={handlePause}
        >
          <Pause className="mr-1 h-3 w-3" />
          {t("aiChat.workflow.pause")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 text-xs"
          disabled={running || !pausedState || !canRunWorkflow}
          onClick={() => void runExecution("resume")}
        >
          {t("aiChat.workflow.resume")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="h-8 text-xs"
          disabled={!running}
          onClick={handleStop}
        >
          <Square className="mr-1 h-3 w-3" />
          {t("aiChat.workflow.stop")}
        </Button>
      </div>
    </div>
  );
}
