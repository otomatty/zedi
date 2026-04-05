/**
 * Step editor list and run progress summary (Issue #462).
 * ステップ編集リストと実行進捗サマリー（Issue #462）。
 */

import { Button, Input, Label } from "@zedi/ui";
import { Plus, Trash2 } from "lucide-react";
import type { WorkflowPanelFormProps } from "./workflowPanelTypes";

type Props = Pick<
  WorkflowPanelFormProps,
  | "t"
  | "draft"
  | "running"
  | "progress"
  | "activeRunSteps"
  | "addStep"
  | "removeStep"
  | "updateStep"
>;

/**
 * Editable steps and optional streaming progress block.
 * 編集可能なステップとストリーミング進捗ブロック。
 */
export function WorkflowPanelStepsAndProgress(props: Props) {
  const { t, draft, running, progress, activeRunSteps, addStep, removeStep, updateStep } = props;

  return (
    <>
      <div className="border-border space-y-2 border-t pt-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t("aiChat.workflow.steps")}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={running}
            onClick={addStep}
          >
            <Plus className="mr-1 h-3 w-3" />
            {t("aiChat.workflow.addStep")}
          </Button>
        </div>

        {draft.steps.map((step, index) => (
          <div key={step.id} className="bg-muted/40 space-y-2 rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                {t("aiChat.workflow.stepLabel", { n: index + 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={running || draft.steps.length <= 1}
                onClick={() => removeStep(index)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <Input
              className="h-8 text-xs"
              value={step.title}
              placeholder={t("aiChat.workflow.stepTitlePlaceholder")}
              disabled={running}
              onChange={(e) => updateStep(index, { title: e.target.value })}
            />
            <textarea
              className="border-input bg-background focus-visible:ring-ring min-h-[72px] w-full rounded-md border px-2 py-1.5 text-xs focus-visible:ring-2 focus-visible:outline-none"
              value={step.instruction}
              placeholder={t("aiChat.workflow.stepInstructionPlaceholder")}
              disabled={running}
              onChange={(e) => updateStep(index, { instruction: e.target.value })}
            />
          </div>
        ))}
      </div>

      {progress && (
        <div className="bg-muted/30 rounded-md border p-2 text-xs">
          <div className="text-muted-foreground mb-1 font-medium">
            {t("aiChat.workflow.progressTitle")}
          </div>
          <ul className="space-y-1">
            {(activeRunSteps ?? draft.steps).map((s, i) => {
              const st = progress.stepStatuses[i] ?? "pending";
              const mark =
                st === "done" ? "☑" : st === "running" ? "🔄" : st === "error" ? "⚠️" : "⬜";
              return (
                <li key={s.id} className="flex flex-col gap-0.5">
                  <span>
                    {mark} {s.title || t("aiChat.workflow.unnamedStep", { n: i + 1 })}
                  </span>
                  {st === "running" && progress.currentStepStreaming ? (
                    <span className="text-muted-foreground line-clamp-3 pl-4">
                      {progress.currentStepStreaming}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
