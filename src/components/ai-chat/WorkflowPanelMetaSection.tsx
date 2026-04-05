/**
 * Workflow name, templates, saved definitions, and import/export (Issue #462).
 * ワークフロー名・テンプレート・保存定義・インポート/エクスポート（Issue #462）。
 */

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@zedi/ui";
import { Download, Trash2, Upload } from "lucide-react";
import {
  WORKFLOW_TEMPLATE_IDS,
  WORKFLOW_TEMPLATE_NAME_KEYS,
  type WorkflowTemplateId,
} from "@/lib/workflow/templates";
import type { WorkflowPanelFormProps } from "./workflowPanelTypes";

type Props = Pick<
  WorkflowPanelFormProps,
  | "t"
  | "draft"
  | "setDraft"
  | "definitions"
  | "selectedSavedId"
  | "importInputRef"
  | "running"
  | "loadTemplate"
  | "saveCustom"
  | "exportJson"
  | "onImportFile"
  | "loadSaved"
  | "deleteSaved"
>;

/**
 * Name field, template selector, saved workflow picker, and JSON import/export.
 * 名前・テンプレート・保存済み選択・JSON インポート/エクスポート。
 */
export function WorkflowPanelMetaSection(props: Props) {
  const {
    t,
    draft,
    setDraft,
    definitions,
    selectedSavedId,
    importInputRef,
    running,
    loadTemplate,
    saveCustom,
    exportJson,
    onImportFile,
    loadSaved,
    deleteSaved,
  } = props;

  return (
    <>
      <div className="grid gap-2">
        <Label className="text-xs">{t("aiChat.workflow.workflowName")}</Label>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, updatedAt: Date.now() }))}
          placeholder={t("aiChat.workflow.workflowNamePlaceholder")}
          disabled={running}
        />
      </div>

      <div className="grid gap-2">
        <Label className="text-xs">{t("aiChat.workflow.template")}</Label>
        <Select disabled={running} onValueChange={(v) => loadTemplate(v as WorkflowTemplateId)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={t("aiChat.workflow.templatePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_TEMPLATE_IDS.map((id) => (
              <SelectItem key={id} value={id} className="text-xs">
                {t(WORKFLOW_TEMPLATE_NAME_KEYS[id])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label className="text-xs">{t("aiChat.workflow.savedWorkflows")}</Label>
        <div className="flex gap-2">
          <Select
            disabled={running}
            value={selectedSavedId || undefined}
            onValueChange={(v) => loadSaved(v)}
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder={t("aiChat.workflow.pickSaved")} />
            </SelectTrigger>
            <SelectContent>
              {definitions.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!selectedSavedId || running}
            onClick={deleteSaved}
            title={t("aiChat.workflow.deleteSaved")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 text-xs"
          disabled={running}
          onClick={saveCustom}
        >
          {t("aiChat.workflow.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={running}
          onClick={exportJson}
        >
          <Download className="mr-1 h-3 w-3" />
          {t("aiChat.workflow.export")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={running}
          onClick={() => importInputRef.current?.click()}
        >
          <Upload className="mr-1 h-3 w-3" />
          {t("aiChat.workflow.import")}
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onImportFile}
        />
      </div>
    </>
  );
}
